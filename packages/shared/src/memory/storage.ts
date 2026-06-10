/**
 * Persistent memory storage — local-first USER.md / MEMORY.md / PROJECT.md.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { scanMemoryContent } from './scan.ts';
import {
  getDailyMemoryPath,
  getTodayDateKey,
  getYesterdayDateKey,
} from './daily.ts';
import type {
  LoadMemorySnapshotOptions,
  MemoryAction,
  MemoryOperationResult,
  MemorySnapshot,
  MemoryTarget,
} from './types.ts';
import { MEMORY_FILE_MAX_BYTES, MEMORY_OPERATION_MAX_CHARS } from './types.ts';

export function getGlobalMemoryDir(): string {
  const configDir = process.env.CRAFT_CONFIG_DIR ?? join(homedir(), '.craft-agent');
  return join(configDir, 'memory');
}

export function getWorkspaceMemoryDir(workspaceRootPath: string): string {
  return join(workspaceRootPath, '.craft', 'memory');
}

function memoryFilePath(target: MemoryTarget, workspaceRootPath: string): string {
  if (target === 'user') return join(getGlobalMemoryDir(), 'USER.md');
  if (target === 'soul') return join(getGlobalMemoryDir(), 'SOUL.md');
  if (target === 'memory') return join(getGlobalMemoryDir(), 'MEMORY.md');
  if (target === 'daily') return getDailyMemoryPath(workspaceRootPath, getTodayDateKey());
  return join(getWorkspaceMemoryDir(workspaceRootPath), 'PROJECT.md');
}

function ensureParentDir(filePath: string): void {
  const dir = join(filePath, '..');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function readFileOrEmpty(path: string): string {
  if (!existsSync(path)) return '';
  return readFileSync(path, 'utf-8');
}

function writeBounded(path: string, content: string): void {
  const bytes = Buffer.byteLength(content, 'utf-8');
  if (bytes > MEMORY_FILE_MAX_BYTES) {
    throw new Error(`Memory file would exceed ${MEMORY_FILE_MAX_BYTES} bytes (${bytes}). Trim or remove entries first.`);
  }
  ensureParentDir(path);
  writeFileSync(path, content, 'utf-8');
}

function appendSection(existing: string, key: string | undefined, content: string): string {
  const trimmedContent = content.trim();
  if (key) {
    const regex = new RegExp(`## ${escapeRegex(key)}\\s*\\n([\\s\\S]*?)(?=\\n## |$)`, 'i');
    const m = regex.exec(existing);
    if (m) {
      if (m[1]!.trim() === trimmedContent) return existing; // identical — skip
      // Section exists with different content — append the new line within it
      // (reuse replaceSection; it finds the heading and rewrites in-place, no duplicate header)
      const existingBody = m[1]!.trimEnd();
      return replaceSection(existing, key, `${existingBody}\n${trimmedContent}`);
    }
    const block = `\n\n## ${key}\n${trimmedContent}\n`;
    return (existing.trim() + block).trim() + '\n';
  }
  const bulletLine = `- ${trimmedContent}`;
  if (existing.includes(bulletLine)) return existing;
  return (existing.trim() + `\n\n${bulletLine}\n`).trim() + '\n';
}

function replaceSection(existing: string, key: string, content: string): string {
  const heading = `## ${key}`;
  const regex = new RegExp(`## ${escapeRegex(key)}[\\s\\S]*?(?=\\n## |$)`, 'i');
  const replacement = `${heading}\n${content.trim()}\n`;
  if (regex.test(existing)) {
    return existing.replace(regex, replacement).trim() + '\n';
  }
  return appendSection(existing, key, content);
}

function removeSection(existing: string, key: string): string {
  const regex = new RegExp(`\\n?## ${escapeRegex(key)}[\\s\\S]*?(?=\\n## |$)`, 'i');
  const next = existing.replace(regex, '').trim();
  return next ? `${next}\n` : '';
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function loadMemorySnapshot(
  workspaceRootPath: string,
  options?: LoadMemorySnapshotOptions,
): MemorySnapshot {
  const snapshot: MemorySnapshot = {
    userMd: readFileOrEmpty(memoryFilePath('user', workspaceRootPath)),
    soulMd: readFileOrEmpty(memoryFilePath('soul', workspaceRootPath)),
    memoryMd: readFileOrEmpty(memoryFilePath('memory', workspaceRootPath)),
    projectMd: readFileOrEmpty(memoryFilePath('project', workspaceRootPath)),
    capturedAt: Date.now(),
  };

  if (options?.dailyMemory) {
    const today = getTodayDateKey();
    const yesterday = getYesterdayDateKey();
    snapshot.dailyTodayDate = today;
    snapshot.dailyYesterdayDate = yesterday;
    snapshot.dailyTodayMd = readFileOrEmpty(getDailyMemoryPath(workspaceRootPath, today));
    snapshot.dailyYesterdayMd = readFileOrEmpty(getDailyMemoryPath(workspaceRootPath, yesterday));
  }

  return snapshot;
}

export function formatMemorySnapshotForPrompt(snapshot: MemorySnapshot): string {
  const parts: string[] = [];

  if (snapshot.userMd.trim()) {
    parts.push(`<user_profile frozen="true">\n${snapshot.userMd.trim()}\n</user_profile>`);
  }
  if (snapshot.soulMd.trim()) {
    parts.push(`<agent_persona frozen="true">\n${snapshot.soulMd.trim()}\n</agent_persona>`);
  }
  if (snapshot.memoryMd.trim()) {
    parts.push(`<long_term_memory frozen="true">\n${snapshot.memoryMd.trim()}\n</long_term_memory>`);
  }
  if (snapshot.projectMd.trim()) {
    parts.push(`<project_memory frozen="true">\n${snapshot.projectMd.trim()}\n</project_memory>`);
  }
  if (snapshot.dailyTodayMd?.trim() && snapshot.dailyTodayDate) {
    parts.push(
      `<daily_journal date="${snapshot.dailyTodayDate}" frozen="true">\n${snapshot.dailyTodayMd.trim()}\n</daily_journal>`,
    );
  }
  if (snapshot.dailyYesterdayMd?.trim() && snapshot.dailyYesterdayDate) {
    parts.push(
      `<daily_journal date="${snapshot.dailyYesterdayDate}" frozen="true">\n${snapshot.dailyYesterdayMd.trim()}\n</daily_journal>`,
    );
  }

  if (parts.length === 0) return '';
  return `\n\n<agent_memory_snapshot captured_at="${new Date(snapshot.capturedAt).toISOString()}">\n${parts.join('\n\n')}\n</agent_memory_snapshot>`;
}

export function applyMemoryOperation(
  workspaceRootPath: string,
  action: MemoryAction,
  target: MemoryTarget,
  content: string,
  key?: string,
): MemoryOperationResult {
  if (content.length > MEMORY_OPERATION_MAX_CHARS) {
    return {
      ok: false,
      target,
      action,
      message: `Content exceeds ${MEMORY_OPERATION_MAX_CHARS} characters.`,
    };
  }

  if (action !== 'remove') {
    const scan = scanMemoryContent(content);
    if (!scan.safe) {
      return { ok: false, target, action, message: scan.reason ?? 'Content rejected.' };
    }
  }

  const path = memoryFilePath(target, workspaceRootPath);
  let existing = readFileOrEmpty(path);

  try {
    if (action === 'add') {
      existing = appendSection(existing, key, content);
    } else if (action === 'replace') {
      if (!key) {
        return { ok: false, target, action, message: 'replace requires a section key.' };
      }
      existing = replaceSection(existing, key, content);
    } else if (action === 'remove') {
      if (!key) {
        return { ok: false, target, action, message: 'remove requires a section key.' };
      }
      existing = removeSection(existing, key);
    }

    writeBounded(path, existing);
    return {
      ok: true,
      target,
      action,
      message: `Updated ${target} memory (${action}${key ? `: ${key}` : ''}).`,
      bytesAfter: Buffer.byteLength(existing, 'utf-8'),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { ok: false, target, action, message };
  }
}
