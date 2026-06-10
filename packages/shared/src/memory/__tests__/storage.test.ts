import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  applyMemoryOperation,
  getGlobalMemoryDir,
  loadMemorySnapshot,
  formatMemorySnapshotForPrompt,
} from '../storage.ts';
import { getDailyMemoryPath, getTodayDateKey } from '../daily.ts';
import { scanMemoryContent } from '../scan.ts';

describe('memory storage', () => {
  let workspaceRoot: string;
  const prevConfigDir = process.env.CRAFT_CONFIG_DIR;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'craft-memory-'));
    process.env.CRAFT_CONFIG_DIR = join(workspaceRoot, 'craft-config');
  });

  afterEach(() => {
    if (prevConfigDir === undefined) delete process.env.CRAFT_CONFIG_DIR;
    else process.env.CRAFT_CONFIG_DIR = prevConfigDir;
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  test('applyMemoryOperation add writes USER.md', () => {
    const result = applyMemoryOperation(workspaceRoot, 'add', 'user', 'Prefers terse answers', 'style');
    expect(result.ok).toBe(true);
    const userPath = join(getGlobalMemoryDir(), 'USER.md');
    expect(existsSync(userPath)).toBe(true);
    expect(readFileSync(userPath, 'utf-8')).toContain('Prefers terse answers');
  });

  test('scanMemoryContent rejects api keys', () => {
    const scan = scanMemoryContent('api_key=sk-abcdefghijklmnopqrstuvwxyz123456');
    expect(scan.safe).toBe(false);
  });

  test('applyMemoryOperation add writes daily journal for today', () => {
    const result = applyMemoryOperation(workspaceRoot, 'add', 'daily', 'Shipped memory indexer', 'work');
    expect(result.ok).toBe(true);
    const dailyPath = getDailyMemoryPath(workspaceRoot, getTodayDateKey());
    expect(existsSync(dailyPath)).toBe(true);
    expect(readFileSync(dailyPath, 'utf-8')).toContain('Shipped memory indexer');
  });

  test('applyMemoryOperation add same key twice appends within section, no duplicate header', () => {
    applyMemoryOperation(workspaceRoot, 'add', 'user', 'First entry', 'Preferences');
    applyMemoryOperation(workspaceRoot, 'add', 'user', 'Second entry', 'Preferences');
    const userPath = join(getGlobalMemoryDir(), 'USER.md');
    const content = readFileSync(userPath, 'utf-8');
    const headerCount = (content.match(/^## Preferences/gm) ?? []).length;
    expect(headerCount).toBe(1);
    expect(content).toContain('First entry');
    expect(content).toContain('Second entry');
  });

  test('loadMemorySnapshot includes daily blocks when enabled', () => {
    applyMemoryOperation(workspaceRoot, 'add', 'daily', 'Today note');
    const snapshot = loadMemorySnapshot(workspaceRoot, { dailyMemory: true });
    expect(snapshot.dailyTodayMd).toContain('Today note');
    const formatted = formatMemorySnapshotForPrompt(snapshot);
    expect(formatted).toContain('<daily_journal');
    expect(formatted).toContain(snapshot.dailyTodayDate ?? '');
  });
});
