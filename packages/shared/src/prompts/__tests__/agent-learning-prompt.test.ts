import { describe, expect, test } from 'bun:test';
import { buildAgentLearningPromptBundle } from '../../agent/agent-learning-prompt.ts';

describe('agent-learning prompt snapshot', () => {
  test('returns empty appendix when disabled', () => {
    const prev = process.env.CRAFT_FEATURE_AGENT_LEARNING;
    delete process.env.CRAFT_FEATURE_AGENT_LEARNING;
    const bundle = buildAgentLearningPromptBundle({
      workspaceRootPath: '/tmp/nonexistent-workspace',
    });
    expect(bundle.appendix).toBe('');
    if (prev === undefined) delete process.env.CRAFT_FEATURE_AGENT_LEARNING;
    else process.env.CRAFT_FEATURE_AGENT_LEARNING = prev;
  });
});
