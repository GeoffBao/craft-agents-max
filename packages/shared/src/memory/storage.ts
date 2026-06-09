/**
 * Persistent memory storage — local-first USER.md / MEMORY.md / PROJECT.md.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { CONFIG_DIR } from '../config/paths.ts';
import { scanMemoryContent } from './scan.ts';
import type { MemoryAction, MemoryOperationResult, MemorySnapshot, MemoryTarget } from './types.ts';
import { MEMORY_FILE_MAX_BYTES, MEMORY_OPERATION_MAX_CHARS } from './types.ts';

export function getGlobalMemoryDir(): string {
  return join(CONFIG_DIR, 'memory');
}

export function getWorkspaceMemoryDir(workspaceRootPath: string): string {
  return join(workspaceRootPath, '.craft', 'memory');
}

function memoryFilePath(target: MemoryTarget, workspaceRootPath: string): string {
  if (target === 'user') return join(getGlobalMemoryDir(), 'USER.md');
  if (target === 'memory') return join(getGlobalMemoryDir(), 'MEMORY.md');
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
  const block = key
    ? `\n\n## ${key}\n${content.trim()}\n`
    : `\n\n- ${content.trim()}\n`;
  return (existing.trim() + block).trim() + '\n';
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

export function loadMemorySnapshot(workspaceRootPath: string): MemorySnapshot {
  return {
    userMd: readFileOrEmpty(memoryFilePath('user', workspaceRootPath)),
    memoryMd: readFileOrEmpty(memoryFilePath('memory', workspaceRootPath)),
    projectMd: readFileOrEmpty(memoryFilePath('project', workspaceRootPath)),
    capturedAt: Date.now(),
  };
}

export function formatMemorySnapshotForPrompt(snapshot: MemorySnapshot): string {
  const parts: string[] = [];

  if (snapshot.userMd.trim()) {
    parts.push(`<user_profile frozen="true">\n${snapshot.userMd.trim()}\n</user_profile>`);
  }
  if (snapshot.memoryMd.trim()) {
    parts.push(`<long_term_memory frozen="true">\n${snapshot.memoryMd.trim()}\n</long_term_memory>`);
  }
  if (snapshot.projectMd.trim()) {
    parts.push(`<project_memory frozen="true">\n${snapshot.projectMd.trim()}\n</project_memory>`);
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
