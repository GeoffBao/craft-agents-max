import { describe, expect, test } from 'bun:test';
import { shouldRunSoftCompactionFlush } from '../soft-compaction-flush.ts';

describe('soft compaction flush threshold', () => {
  test('triggers at 85% of context window', () => {
    const d = shouldRunSoftCompactionFlush({
      contextTokens: 170_000,
      contextWindow: 200_000,
    });
    expect(d.shouldFlush).toBe(true);
    expect(d.reason).toContain('85%');
  });

  test('does not trigger below soft limit', () => {
    const d = shouldRunSoftCompactionFlush({
      contextTokens: 50_000,
      contextWindow: 200_000,
    });
    expect(d.shouldFlush).toBe(false);
  });

  test('falls back to default threshold ratio', () => {
    const d = shouldRunSoftCompactionFlush({ contextTokens: 70_000 });
    expect(d.shouldFlush).toBe(true);
  });
});
