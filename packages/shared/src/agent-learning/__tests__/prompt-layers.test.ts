import { describe, expect, test } from 'bun:test';
import { composePinnedAgentLearningAppendix } from '../prompt-layers.ts';

describe('prompt-layers', () => {
  test('composePinnedAgentLearningAppendix wraps stable and context', () => {
    const appendix = composePinnedAgentLearningAppendix({
      stable: '<agent_memory_snapshot>user</agent_memory_snapshot>',
      context: '<agent_intelligence_guidance>discipline</agent_intelligence_guidance>',
      volatile: '',
    });
    expect(appendix).toContain('<agent_learning_layers>');
    expect(appendix).toContain('<agent_learning_stable>');
    expect(appendix).toContain('<agent_learning_context>');
    expect(appendix).not.toContain('agent_learning_volatile');
  });
});
