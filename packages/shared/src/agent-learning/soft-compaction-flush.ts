/**
 * Soft-threshold gate for proactive silent compaction memory flush.
 *
 * Runs before SDK auto-compaction when context nears capacity (OpenClaw-style).
 */

import { DEFAULT_TOKEN_THRESHOLD } from '../agent/context-compression.ts';

/** Fraction of context window / threshold that triggers proactive flush. */
export const SOFT_FLUSH_RATIO = 0.85;

export interface SoftCompactionFlushInput {
  contextTokens?: number;
  contextWindow?: number;
  messageCount?: number;
  tokenThreshold?: number;
}

export interface SoftCompactionFlushDecision {
  shouldFlush: boolean;
  reason: string;
}

export function shouldRunSoftCompactionFlush(
  input: SoftCompactionFlushInput,
): SoftCompactionFlushDecision {
  const tokens = input.contextTokens ?? 0;
  const threshold = input.tokenThreshold ?? DEFAULT_TOKEN_THRESHOLD;

  if (input.contextWindow && input.contextWindow > 0 && tokens > 0) {
    const softLimit = Math.floor(input.contextWindow * SOFT_FLUSH_RATIO);
    if (tokens >= softLimit) {
      return {
        shouldFlush: true,
        reason: `Context ${tokens.toLocaleString()} tokens >= ${softLimit.toLocaleString()} (85% of ${input.contextWindow.toLocaleString()})`,
      };
    }
  }

  const softTokenLimit = Math.floor(threshold * SOFT_FLUSH_RATIO);
  if (tokens >= softTokenLimit) {
    return {
      shouldFlush: true,
      reason: `Context ${tokens.toLocaleString()} tokens >= soft limit ${softTokenLimit.toLocaleString()}`,
    };
  }

  const messageCount = input.messageCount ?? 0;
  if (messageCount >= 100) {
    return {
      shouldFlush: true,
      reason: `${messageCount} messages — approaching compaction message threshold`,
    };
  }

  return { shouldFlush: false, reason: '' };
}
