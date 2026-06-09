/**
 * SQLite FTS5 index over MEMORY.md, PROJECT.md, and daily journal files.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import {
  getGlobalMemoryDir,
  getWorkspaceMemoryDir,
  getDailyMemoryDir,
} from '@craft-agent/shared/memory';
import type { MemorySearchHit, MemorySearchResult } from '@craft-agent/shared/memory';
import { openIndexDatabase, type IndexDatabase } from './session-indexer-db.ts';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS file_meta (
  file_id TEXT PRIMARY KEY,
  abs_path TEXT NOT NULL,
  target TEXT NOT NULL,
  date_key TEXT,
  modified_at INTEGER NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS lines_fts USING fts5(
  file_id UNINDEXED,
  line_no UNINDEXED,
  section,
  content,
  tokenize = 'porter'
);
`;

interface MemoryFileRef {
  fileId: string;
  absPath: string;
  target: 'memory' | 'project' | 'daily';
  dateKey?: string;
}

function collectMemoryFiles(workspaceRootPath: string): MemoryFileRef[] {
  const files: MemoryFileRef[] = [
    {
      fileId: 'memory',
      absPath: join(getGlobalMemoryDir(), 'MEMORY.md'),
      target: 'memory',
    },
    {
      fileId: 'project',
      absPath: join(getWorkspaceMemoryDir(workspaceRootPath), 'PROJECT.md'),
      target: 'project',
    },
  ];

  const dailyDir = getDailyMemoryDir(workspaceRootPath);
  if (existsSync(dailyDir)) {
    for (const entry of readdirSync(dailyDir)) {
      if (!entry.endsWith('.md')) continue;
      files.push({
        fileId: `daily:${entry}`,
        absPath: join(dailyDir, entry),
        target: 'daily',
        dateKey: entry.replace(/\.md$/, ''),
      });
    }
  }

  return files;
}

function fileLabel(ref: MemoryFileRef): string {
  if (ref.target === 'memory') return 'MEMORY.md';
  if (ref.target === 'project') return 'PROJECT.md';
  return `daily/${ref.dateKey}.md`;
}

export class MemoryIndexManager {
  private db: IndexDatabase;
  private workspaceRootPath: string;

  constructor(workspaceRootPath: string) {
    this.workspaceRootPath = workspaceRootPath;
    const indexDir = join(workspaceRootPath, '.craft', 'memory-index');
    if (!existsSync(indexDir)) {
      mkdirSync(indexDir, { recursive: true });
    }
    const dbPath = join(indexDir, 'memory-fts.sqlite');
    this.db = openIndexDatabase(dbPath);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec(SCHEMA);
  }

  close(): void {
    this.db.close();
  }

  syncAll(): void {
    const files = collectMemoryFiles(this.workspaceRootPath);
    const seen = new Set<string>();

    for (const ref of files) {
      seen.add(ref.fileId);
      if (!existsSync(ref.absPath)) {
        this.removeFile(ref.fileId);
        continue;
      }
      const mtime = statSync(ref.absPath).mtimeMs;
      const row = this.db.prepare(
        'SELECT modified_at FROM file_meta WHERE file_id = ?',
      ).get(ref.fileId) as { modified_at: number } | undefined;
      if (!row || row.modified_at < mtime) {
        this.indexFile(ref, mtime);
      }
    }

    const stale = this.db.prepare('SELECT file_id FROM file_meta').all() as Array<{ file_id: string }>;
    for (const row of stale) {
      if (!seen.has(row.file_id)) {
        this.removeFile(row.file_id);
      }
    }
  }

  private removeFile(fileId: string): void {
    this.db.prepare('DELETE FROM lines_fts WHERE file_id = ?').run(fileId);
    this.db.prepare('DELETE FROM file_meta WHERE file_id = ?').run(fileId);
  }

  private indexFile(ref: MemoryFileRef, modifiedAt: number): void {
    const content = readFileSync(ref.absPath, 'utf-8');
    const lines = content.split('\n');

    this.removeFile(ref.fileId);
    this.db.prepare(
      'INSERT OR REPLACE INTO file_meta (file_id, abs_path, target, date_key, modified_at) VALUES (?, ?, ?, ?, ?)',
    ).run(ref.fileId, ref.absPath, ref.target, ref.dateKey ?? null, modifiedAt);

    const insert = this.db.prepare(
      'INSERT INTO lines_fts (file_id, line_no, section, content) VALUES (?, ?, ?, ?)',
    );

    let currentSection: string | undefined;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (line.startsWith('## ')) {
        currentSection = line.slice(3).trim();
      }
      const trimmed = line.trim();
      if (!trimmed) continue;
      insert.run(ref.fileId, i + 1, currentSection ?? '', trimmed.slice(0, 2000));
    }
  }

  search(query: string, limit = 10): MemorySearchResult {
    this.syncAll();
    const capped = Math.min(limit, 25);
    const ftsQuery = query
      .replace(/"/g, '')
      .split(/\s+/)
      .filter(Boolean)
      .map(t => `"${t}"`)
      .join(' OR ');

    if (!ftsQuery) {
      return { hits: [], totalApprox: 0 };
    }

    const rows = this.db.prepare(`
      SELECT f.file_id, f.target, f.date_key,
        l.line_no,
        snippet(lines_fts, 3, '[', ']', '…', 32) AS snippet,
        l.section, l.content
      FROM lines_fts l
      JOIN file_meta f ON f.file_id = l.file_id
      WHERE lines_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(ftsQuery, capped) as Array<{
      file_id: string;
      target: string;
      date_key: string | null;
      line_no: number;
      snippet: string;
      section: string | null;
      content: string;
    }>;

    const fileRefs = new Map(
      collectMemoryFiles(this.workspaceRootPath).map(r => [r.fileId, r]),
    );

    const hits: MemorySearchHit[] = rows.map(row => {
      const ref = fileRefs.get(row.file_id);
      return {
        line: row.line_no,
        snippet: row.snippet || row.content.slice(0, 300),
        section: row.section?.trim() || undefined,
        target: row.target as MemorySearchHit['target'],
        file: ref ? fileLabel(ref) : row.file_id,
        date: row.date_key ?? undefined,
      };
    });

    return { hits, totalApprox: hits.length };
  }
}

const indexManagers = new Map<string, MemoryIndexManager>();

export function getMemoryIndexManager(workspaceRootPath: string): MemoryIndexManager {
  let mgr = indexManagers.get(workspaceRootPath);
  if (!mgr) {
    mgr = new MemoryIndexManager(workspaceRootPath);
    indexManagers.set(workspaceRootPath, mgr);
  }
  return mgr;
}
