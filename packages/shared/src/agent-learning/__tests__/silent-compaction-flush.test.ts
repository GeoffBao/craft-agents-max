import { describe, expect, test } from 'bun:test';
import {
  buildSilentCompactionFlushPrompt,
  parseSilentCompactionFlushResponse,
} from '../silent-compaction-flush.ts';

describe('silent compaction flush', () => {
  test('parseSilentCompactionFlushResponse handles NO_REPLY', () => {
    const result = parseSilentCompactionFlushResponse('NO_REPLY');
    expect(result?.noReply).toBe(true);
    expect(result?.writes).toEqual([]);
  });

  test('parseSilentCompactionFlushResponse parses writes', () => {
    const raw = `{
      "writes": [
        { "target": "memory", "key": "prefs", "content": "Prefers terse answers" },
        { "target": "daily", "content": "Worked on memory indexer today" }
      ]
    }`;
    const result = parseSilentCompactionFlushResponse(raw);
    expect(result?.noReply).toBe(false);
    expect(result?.writes).toHaveLength(2);
    expect(result?.writes[0]?.target).toBe('memory');
    expect(result?.writes[1]?.target).toBe('daily');
  });

  test('buildSilentCompactionFlushPrompt mentions daily when enabled', () => {
    const prompt = buildSilentCompactionFlushPrompt({
      sessionId: 's1',
      recentMessages: [{ role: 'user', content: 'Please remember I prefer Bun' }],
      dailyMemoryEnabled: true,
    });
    expect(prompt).toContain('daily');
    expect(prompt).toContain('NO_REPLY');
  });
});
