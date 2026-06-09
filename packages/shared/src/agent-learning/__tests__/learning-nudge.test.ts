import { describe, expect, test } from 'bun:test';
import {
  evaluateLearningNudge,
  formatLearningNudgeCandidateInfoMessage,
} from '../learning-nudge.ts';

describe('learning-nudge', () => {
  test('PreCompact nudge when message count high', () => {
    const nudge = evaluateLearningNudge({
      sessionId: 's1',
      event: 'PreCompact',
      messageCount: 50,
    });
    expect(nudge?.kind).toBe('memory');
    expect(nudge?.reason).toContain('Compaction');
  });

  test('formatLearningNudgeCandidateInfoMessage is suggest-only', () => {
    const text = formatLearningNudgeCandidateInfoMessage({
      sessionId: 's1',
      createdAt: Date.now(),
      kind: 'both',
      reason: 'test reason',
    });
    expect(text).toContain('not auto-written');
    expect(text).toContain('`memory`');
  });
});
