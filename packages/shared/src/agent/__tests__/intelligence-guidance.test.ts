import { describe, expect, test } from 'bun:test';
import {
  buildIntelligenceGuidance,
  shouldInjectActionDiscipline,
} from '../intelligence-guidance.ts';

describe('intelligence-guidance', () => {
  test('includes memory guidance only when memory tool is available', () => {
    const withMemory = buildIntelligenceGuidance({
      availableTools: new Set(['memory']),
    });
    expect(withMemory).toContain('Memory discipline');
    expect(withMemory).not.toContain('Cross-session recall');

    const without = buildIntelligenceGuidance({
      availableTools: new Set(['session_search']),
    });
    expect(without).not.toContain('Memory discipline');
    expect(without).toContain('Cross-session recall');
  });

  test('action discipline skipped for Claude', () => {
    expect(shouldInjectActionDiscipline('anthropic', 'claude-sonnet-4-20250514')).toBe(false);
    expect(shouldInjectActionDiscipline('openai', 'gpt-4o')).toBe(true);
  });
});
