/**
 * SQLite FTS5 index over workspace session JSONL files.
 *
 * Derived data only — safe to delete and rebuild.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync } from 'fs';
import { openIndexDatabase, type IndexDatabase } from './session-indexer-db.ts';
import { join } from 'path';
import { getWorkspaceSessionsPath } from '@craft-agent/shared/workspaces';
import { getSessionFilePath, readSessionHeader } from '@craft-agent/shared/sessions';
import type { StoredMessage } from '@craft-agent/core/types';
import { safeJsonParse } from '@craft-agent/shared/utils/files';
import type { SessionSearchHit, SessionSearchResult } from '@craft-agent/session-tools-core';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  session_name TEXT,
  updated_at INTEGER
);

CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
  session_id,
  message_id,
  role,
  content,
  tokenize = 'porter'
);
`;

export class SessionIndexManager {
  private db: IndexDatabase;
  private workspaceRootPath: string;

  constructor(workspaceRootPath: string) {
    this.workspaceRootPath = workspaceRootPath;
    const indexDir = join(workspaceRootPath, '.craft', 'memory-index');
    if (!existsSync(indexDir)) {
      mkdirSync(indexDir, { recursive: true });
    }
    const dbPath = join(indexDir, 'sessions-fts.sqlite');
    this.db = openIndexDatabase(dbPath);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec(SCHEMA);
  }

  close(): void {
    this.db.close();
  }

  rebuild(): { sessions: number; messages: number } {
    this.db.exec('DELETE FROM sessions;');
    this.db.exec('DELETE FROM messages_fts;');

    const sessionsDir = getWorkspaceSessionsPath(this.workspaceRootPath);
    if (!existsSync(sessionsDir)) {
      return { sessions: 0, messages: 0 };
    }

    let sessionCount = 0;
    let messageCount = 0;

    for (const entry of readdirSync(sessionsDir)) {
      const sessionId = entry;
      const jsonlPath = getSessionFilePath(this.workspaceRootPath, sessionId);
      if (!existsSync(jsonlPath)) continue;
      const indexed = this.indexSessionFile(sessionId, jsonlPath);
      if (indexed > 0) {
        sessionCount++;
        messageCount += indexed;
      }
    }

    return { sessions: sessionCount, messages: messageCount };
  }

  indexSession(sessionId: string): number {
    const jsonlPath = getSessionFilePath(this.workspaceRootPath, sessionId);
    if (!existsSync(jsonlPath)) return 0;
    return this.indexSessionFile(sessionId, jsonlPath);
  }

  private indexSessionFile(sessionId: string, jsonlPath: string): number {
    const header = readSessionHeader(jsonlPath);
    const sessionName = header?.name ?? sessionId;
    const updatedAt = header?.lastMessageAt ?? header?.lastUsedAt ?? header?.createdAt ?? Date.now();

    this.db.prepare(
      'INSERT OR REPLACE INTO sessions (session_id, session_name, updated_at) VALUES (?, ?, ?)',
    ).run(sessionId, sessionName, updatedAt);

    this.db.prepare('DELETE FROM messages_fts WHERE session_id = ?').run(sessionId);

    const content = readFileSync(jsonlPath, 'utf-8');
    const lines = content.split('\n').filter(Boolean);
    if (lines.length <= 1) return 0;

    const insert = this.db.prepare(
      'INSERT INTO messages_fts (session_id, message_id, role, content) VALUES (?, ?, ?, ?)',
    );

    let count = 0;
    for (let i = 1; i < lines.length; i++) {
      const msg = safeJsonParse(lines[i]!) as StoredMessage | null;
      if (!msg?.id || !msg.content?.trim()) continue;
      if (msg.isIntermediate) continue;
      const role = msg.type ?? 'unknown';
      if (role !== 'user' && role !== 'assistant') continue;
      insert.run(sessionId, msg.id, role, msg.content.slice(0, 8000));
      count++;
    }

    return count;
  }

  ensureIndexed(): void {
    const row = this.db.prepare('SELECT COUNT(*) as c FROM messages_fts').get() as { c: number };
    if (row.c === 0) {
      this.rebuild();
    }
  }

  search(options: {
    query: string;
    limit?: number;
    sessionId?: string;
    cursor?: string;
  }): SessionSearchResult {
    this.ensureIndexed();
    const limit = Math.min(options.limit ?? 10, 25);
    const offset = options.cursor ? parseInt(options.cursor, 10) || 0 : 0;

    const ftsQuery = options.query
      .replace(/"/g, '')
      .split(/\s+/)
      .filter(Boolean)
      .map(t => `"${t}"`)
      .join(' OR ');

    if (options.sessionId) {
      const rows = this.db.prepare(`
        SELECT m.session_id, m.message_id, m.role,
          snippet(messages_fts, 2, '[', ']', '…', 32) AS snippet,
          m.content, s.session_name
        FROM messages_fts m
        LEFT JOIN sessions s ON s.session_id = m.session_id
        WHERE messages_fts MATCH ? AND m.session_id = ?
        ORDER BY rank LIMIT ? OFFSET ?
      `).all(ftsQuery, options.sessionId, limit + 1, offset) as Array<{
      session_id: string;
      message_id: string;
      role: string;
      snippet: string;
      content: string;
      session_name: string | null;
    }>;
      return this.mapSearchRows(rows, limit, offset);
    }

    const rows = this.db.prepare(`
      SELECT m.session_id, m.message_id, m.role,
        snippet(messages_fts, 2, '[', ']', '…', 32) AS snippet,
        m.content, s.session_name
      FROM messages_fts m
      LEFT JOIN sessions s ON s.session_id = m.session_id
      WHERE messages_fts MATCH ?
      ORDER BY rank LIMIT ? OFFSET ?
    `).all(ftsQuery, limit + 1, offset) as Array<{
      session_id: string;
      message_id: string;
      role: string;
      snippet: string;
      content: string;
      session_name: string | null;
    }>;

    return this.mapSearchRows(rows, limit, offset);
  }

  private mapSearchRows(
    rows: Array<{
      session_id: string;
      message_id: string;
      role: string;
      snippet: string;
      content: string;
      session_name: string | null;
    }>,
    limit: number,
    offset: number,
  ): SessionSearchResult {
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    const hits: SessionSearchHit[] = page.map(row => ({
      sessionId: row.session_id,
      sessionName: row.session_name ?? undefined,
      messageId: row.message_id,
      role: row.role,
      snippet: row.snippet || row.content.slice(0, 300),
    }));

    return {
      hits,
      nextCursor: hasMore ? String(offset + limit) : undefined,
      totalApprox: hits.length,
    };
  }
}

const indexManagers = new Map<string, SessionIndexManager>();

export function getSessionIndexManager(workspaceRootPath: string): SessionIndexManager {
  let mgr = indexManagers.get(workspaceRootPath);
  if (!mgr) {
    mgr = new SessionIndexManager(workspaceRootPath);
    indexManagers.set(workspaceRootPath, mgr);
  }
  return mgr;
}
