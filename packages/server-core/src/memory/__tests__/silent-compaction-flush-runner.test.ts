import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { runSilentCompactionFlushIfEnabled } from '../silent-compaction-flush-runner.ts';
import { getGlobalMemoryDir } from '@craft-agent/shared/memory';

describe('silent compaction flush runner', () => {
  let workspaceRoot: string;
  const prevConfigDir = process.env.CRAFT_CONFIG_DIR;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'craft-silent-flush-'));
    process.env.CRAFT_CONFIG_DIR = join(workspaceRoot, 'craft-config');
    mkdirSync(join(workspaceRoot, 'sources'), { recursive: true });
    mkdirSync(join(process.env.CRAFT_CONFIG_DIR, 'memory'), { recursive: true });
    writeFileSync(join(workspaceRoot, 'config.json'), JSON.stringify({
      id: 'ws1',
      name: 'Test',
      slug: 'test',
      createdAt: 1,
      updatedAt: 1,
      agentLearning: {
        enabled: true,
        compactionMemoryFlush: true,
        compactionSilentFlush: true,
      },
    }));
  });

  afterEach(() => {
    if (prevConfigDir === undefined) delete process.env.CRAFT_CONFIG_DIR;
    else process.env.CRAFT_CONFIG_DIR = prevConfigDir;
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  test('applies memory writes from mini-agent JSON', async () => {
    const outcome = await runSilentCompactionFlushIfEnabled({
      workspaceRootPath: workspaceRoot,
      sessionId: 's1',
      messages: [
        { role: 'user', content: 'Remember I prefer Bun' },
        { role: 'assistant', content: 'Noted' },
        { role: 'user', content: 'Also use terse answers' },
        { role: 'assistant', content: 'OK' },
      ],
      agent: {
        runMiniCompletion: async () => JSON.stringify({
          writes: [{ target: 'memory', key: 'runtime', content: 'Prefers Bun runtime' }],
        }),
      },
    });

    expect(outcome.appliedKeys).toContain('runtime');
    const memoryPath = join(getGlobalMemoryDir(), 'MEMORY.md');
    expect(existsSync(memoryPath)).toBe(true);
    expect(readFileSync(memoryPath, 'utf-8')).toContain('Prefers Bun runtime');
  });
});
