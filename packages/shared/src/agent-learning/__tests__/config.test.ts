import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { resolveAgentLearningConfig, getEnabledAgentLearningTools } from '../config.ts';

describe('agent-learning config', () => {
  let workspaceRoot: string;
  const prevEnv = process.env.CRAFT_FEATURE_AGENT_LEARNING;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'craft-al-'));
    mkdirSync(join(workspaceRoot, 'sources'), { recursive: true });
  });

  afterEach(() => {
    if (prevEnv === undefined) delete process.env.CRAFT_FEATURE_AGENT_LEARNING;
    else process.env.CRAFT_FEATURE_AGENT_LEARNING = prevEnv;
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  test('defaults to disabled without env or workspace config', () => {
    delete process.env.CRAFT_FEATURE_AGENT_LEARNING;
    writeFileSync(join(workspaceRoot, 'config.json'), JSON.stringify({
      id: 'ws1',
      name: 'Test',
      slug: 'test',
      createdAt: 1,
      updatedAt: 1,
    }));
    const cfg = resolveAgentLearningConfig(workspaceRoot);
    expect(cfg.enabled).toBe(false);
  });

  test('env override enables features', () => {
    process.env.CRAFT_FEATURE_AGENT_LEARNING = '1';
    const cfg = resolveAgentLearningConfig(workspaceRoot);
    expect(cfg.enabled).toBe(true);
    const tools = getEnabledAgentLearningTools(cfg);
    expect(tools.has('memory')).toBe(true);
    expect(tools.has('memory_search')).toBe(true);
    expect(tools.has('session_search')).toBe(true);
  });

  test('workspace config.json agentLearning block', () => {
    delete process.env.CRAFT_FEATURE_AGENT_LEARNING;
    writeFileSync(join(workspaceRoot, 'config.json'), JSON.stringify({
      id: 'ws1',
      name: 'Test',
      slug: 'test',
      createdAt: 1,
      updatedAt: 1,
      agentLearning: { enabled: true, sessionRecall: false },
    }));
    const cfg = resolveAgentLearningConfig(workspaceRoot);
    expect(cfg.enabled).toBe(true);
    expect(cfg.sessionRecall).toBe(false);
    expect(cfg.persistentMemory).toBe(true);
  });
});
