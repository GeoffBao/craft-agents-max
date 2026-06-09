import { describe, expect, test } from 'bun:test';
import {
  formatLearningNudgeInfoMessage,
  hasActionableLearningSuggestion,
  parseBackgroundReviewResponse,
} from '../background-review.ts';

describe('background-review', () => {
  test('parseBackgroundReviewResponse extracts JSON', () => {
    const result = parseBackgroundReviewResponse('```json\n{"suggestMemory":true,"memoryReason":"prefers terse"}\n```');
    expect(result?.suggestMemory).toBe(true);
    expect(result?.memoryReason).toBe('prefers terse');
  });

  test('formatLearningNudgeInfoMessage combines memory and skill', () => {
    const text = formatLearningNudgeInfoMessage({
      suggestMemory: true,
      memoryReason: 'user prefers Chinese',
      suggestSkill: true,
      skillReason: 'CI debug workflow',
    });
    expect(text).toContain('memory:');
    expect(text).toContain('skill draft:');
    expect(text).toContain('skill_manage');
    expect(text).toContain('not auto-written');
  });

  test('hasActionableLearningSuggestion', () => {
    expect(hasActionableLearningSuggestion({ suggestMemory: false, suggestSkill: false })).toBe(false);
    expect(hasActionableLearningSuggestion({ suggestMemory: true, suggestSkill: false })).toBe(true);
  });
});
