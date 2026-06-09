import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { getMemoryIndexManager } from '../memory-indexer.ts';

describe('memory indexer', () => {
  let workspaceRoot: string;
  const prevConfigDir = process.env.CRAFT_CONFIG_DIR;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'craft-mem-idx-'));
    process.env.CRAFT_CONFIG_DIR = join(workspaceRoot, 'craft-config');
    mkdirSync(join(process.env.CRAFT_CONFIG_DIR, 'memory'), { recursive: true });
    mkdirSync(join(workspaceRoot, '.craft', 'memory', 'daily'), { recursive: true });
  });

  afterEach(() => {
    if (prevConfigDir === undefined) delete process.env.CRAFT_CONFIG_DIR;
    else process.env.CRAFT_CONFIG_DIR = prevConfigDir;
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  test('search finds MEMORY.md and daily journal hits', () => {
    writeFileSync(
      join(process.env.CRAFT_CONFIG_DIR!, 'memory', 'MEMORY.md'),
      '## prefs\nAlways use Bun for scripts\n',
    );
    writeFileSync(
      join(workspaceRoot, '.craft', 'memory', 'PROJECT.md'),
      '## stack\nTypeScript monorepo\n',
    );
    writeFileSync(
      join(workspaceRoot, '.craft', 'memory', 'daily', '2026-06-09.md'),
      '- Shipped memory indexer FTS\n',
    );

    const mgr = getMemoryIndexManager(workspaceRoot);
    const memoryHits = mgr.search('scripts', 10);
    expect(memoryHits.hits.some(h => h.target === 'memory')).toBe(true);

    const dailyHits = mgr.search('Shipped', 10);
    expect(dailyHits.hits.some(h => h.target === 'daily')).toBe(true);
    expect(dailyHits.hits.some(h => h.date === '2026-06-09')).toBe(true);
  });
});
