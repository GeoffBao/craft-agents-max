import { describe, expect, test } from 'bun:test';
import {
  applyCompactionSettingsLinkage,
  mergeAgentLearningWorkspacePatch,
} from '../workspace-settings.ts';

describe('compaction settings linkage', () => {
  test('enabling silent flush enables compaction hints', () => {
    const next = mergeAgentLearningWorkspacePatch(
      { enabled: true, compactionMemoryFlush: false },
      { compactionSilentFlush: true },
    );
    expect(next.compactionMemoryFlush).toBe(true);
    expect(next.compactionSilentFlush).toBe(true);
  });

  test('disabling compaction hints disables silent and auto flush', () => {
    const next = applyCompactionSettingsLinkage(
      {
        enabled: true,
        compactionMemoryFlush: false,
        compactionMemoryAutoFlush: true,
        compactionSilentFlush: true,
      },
      { compactionMemoryFlush: false },
    );
    expect(next.compactionMemoryAutoFlush).toBe(false);
    expect(next.compactionSilentFlush).toBe(false);
  });

  test('enabling auto flush enables compaction hints', () => {
    const next = mergeAgentLearningWorkspacePatch(
      { enabled: true, compactionMemoryFlush: false },
      { compactionMemoryAutoFlush: true },
    );
    expect(next.compactionMemoryFlush).toBe(true);
  });
});
