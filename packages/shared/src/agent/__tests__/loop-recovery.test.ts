import { describe, expect, test } from 'bun:test';
import {
  createLoopRecoveryTracker,
  isJsonToolArgumentError,
  buildLoopRecoveryUserMessage,
} from '../loop-recovery.ts';

describe('loop-recovery', () => {
  test('needs tool nudge when tools ran but no final assistant text', () => {
    const t = createLoopRecoveryTracker();
    t.observe({ type: 'tool_result', toolName: 'Read', result: 'ok' } as any);
    t.observe({ type: 'complete' } as any);
    expect(t.resolveLoopRecoveryKind()).toBe('tool_continuation');
  });

  test('no nudge when final assistant text present', () => {
    const t = createLoopRecoveryTracker();
    t.observe({ type: 'tool_result', toolName: 'Read', result: 'ok' } as any);
    t.observe({ type: 'text_complete', text: 'done' } as any);
    t.observe({ type: 'complete' } as any);
    expect(t.resolveLoopRecoveryKind()).toBe(null);
  });

  test('intermediate-only text triggers thinking continuation', () => {
    const t = createLoopRecoveryTracker();
    t.observe({ type: 'text_complete', text: 'Let me think...', isIntermediate: true } as any);
    t.observe({ type: 'complete' } as any);
    expect(t.resolveLoopRecoveryKind()).toBe('thinking_continuation');
  });

  test('json tool error triggers json repair', () => {
    const t = createLoopRecoveryTracker();
    t.observe({ type: 'error', message: 'Failed to parse tool JSON: Unexpected token' } as any);
    t.observe({ type: 'complete' } as any);
    expect(t.resolveLoopRecoveryKind()).toBe('json_repair');
  });

  test('isJsonToolArgumentError matches common provider errors', () => {
    expect(isJsonToolArgumentError('Failed to parse tool arguments JSON')).toBe(true);
    expect(isJsonToolArgumentError('rate limit exceeded')).toBe(false);
  });

  test('buildLoopRecoveryUserMessage returns distinct prompts', () => {
    expect(buildLoopRecoveryUserMessage('json_repair')).toContain('invalid JSON');
    expect(buildLoopRecoveryUserMessage('thinking_continuation')).toContain('reasoning');
    expect(buildLoopRecoveryUserMessage('tool_continuation')).toContain('tool results');
  });
});
