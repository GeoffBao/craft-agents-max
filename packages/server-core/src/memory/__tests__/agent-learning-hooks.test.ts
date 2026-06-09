import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createMemorySearchFn } from '../agent-learning-hooks.ts';

describe('agent-learning hooks', () => {
  let workspaceRoot: string;
  const prevEnv = process.env.CRAFT_FEATURE_AGENT_LEARNING;
  const prevConfigDir = process.env.CRAFT_CONFIG_DIR;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'craft-al-hooks-'));
    process.env.CRAFT_CONFIG_DIR = join(workspaceRoot, 'craft-config');
    mkdirSync(join(workspaceRoot, 'sources'), { recursive: true });
    mkdirSync(join(process.env.CRAFT_CONFIG_DIR, 'memory'), { recursive: true });
    writeFileSync(join(workspaceRoot, 'config.json'), JSON.stringify({
      id: 'ws1',
      name: 'Test',
      slug: 'test',
      createdAt: 1,
      updatedAt: 1,
      agentLearning: { enabled: true, persistentMemory: true },
    }));
    writeFileSync(
      join(process.env.CRAFT_CONFIG_DIR, 'memory', 'MEMORY.md'),
      '## note\nFTS memory search works\n',
    );
  });

  afterEach(() => {
    if (prevEnv === undefined) delete process.env.CRAFT_FEATURE_AGENT_LEARNING;
    else process.env.CRAFT_FEATURE_AGENT_LEARNING = prevEnv;
    if (prevConfigDir === undefined) delete process.env.CRAFT_CONFIG_DIR;
    else process.env.CRAFT_CONFIG_DIR = prevConfigDir;
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  test('createMemorySearchFn returns FTS hits', async () => {
    const search = createMemorySearchFn(workspaceRoot);
    const result = await search({ query: 'FTS memory', limit: 5 });
    expect(result.hits.length).toBeGreaterThan(0);
    expect(result.hits[0]?.target).toBe('memory');
  });

  test('createMemorySearchFn throws when disabled', async () => {
    writeFileSync(join(workspaceRoot, 'config.json'), JSON.stringify({
      id: 'ws1',
      name: 'Test',
      slug: 'test',
      createdAt: 1,
      updatedAt: 1,
      agentLearning: { enabled: true, persistentMemory: false },
    }));
    const search = createMemorySearchFn(workspaceRoot);
    await expect(search({ query: 'x' })).rejects.toThrow(/disabled/);
  });
});
