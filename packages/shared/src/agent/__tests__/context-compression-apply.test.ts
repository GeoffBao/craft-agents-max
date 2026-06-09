import { describe, expect, test } from 'bun:test';
import { applyContextCompression } from '../context-compression.ts';

describe('applyContextCompression', () => {
  test('collapses middle messages when over threshold', () => {
    const messages = Array.from({ length: 130 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `message ${i} with enough text to count`,
    }));

    const result = applyContextCompression(messages, 1000);
    expect(result.plan.shouldCompress).toBe(true);
    expect(result.middleCollapsed).toBe(true);
    expect(result.messages.length).toBeLessThan(messages.length);
    expect(result.messages.some(m => m.content.includes('context_compression_summary'))).toBe(true);
  });
});
