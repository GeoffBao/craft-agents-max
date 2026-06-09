import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { applyMemoryOperation, getGlobalMemoryDir } from '../storage.ts';
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
});
