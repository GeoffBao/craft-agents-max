/**
 * Pluggable context compression engine (P1).
 *
 * Structured 4-step compression helpers — used by compress_context tool and
 * transfer/fallback summary paths. Does not replace Claude SDK /compact.
 */

export interface CompressionMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolName?: string;
  toolUseId?: string;
  isIntermediate?: boolean;
}

export interface CompressionStats {
  messageCount: number;
  estimatedTokens: number;
  toolResultCount: number;
  oldestUserIndex: number;
}

export interface CompressionPlan {
  shouldCompress: boolean;
  reason: string;
  steps: string[];
  protectedHead: number;
  protectedTail: number;
}

const DEFAULT_TOKEN_THRESHOLD = 80_000;
const CHARS_PER_TOKEN = 4;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function analyzeConversation(messages: CompressionMessage[]): CompressionStats {
  let chars = 0;
  let toolResultCount = 0;
  let oldestUserIndex = -1;

  messages.forEach((m, i) => {
    chars += m.content.length;
    if (m.role === 'tool' || m.toolName) toolResultCount++;
    if (oldestUserIndex < 0 && m.role === 'user' && !m.isIntermediate) {
      oldestUserIndex = i;
    }
  });

  return {
    messageCount: messages.length,
    estimatedTokens: estimateTokens(String(chars)),
    toolResultCount,
    oldestUserIndex,
  };
}

export function shouldCompress(
  messages: CompressionMessage[],
  tokenThreshold = DEFAULT_TOKEN_THRESHOLD,
): CompressionPlan {
  const stats = analyzeConversation(messages);
  const should = stats.estimatedTokens >= tokenThreshold || stats.messageCount >= 120;

  const steps = [
    'Trim oversized old tool results (keep last N tool pairs intact)',
    'Protect first user message and most recent 6 turns',
    'Build structured summary of removed middle section',
    'Drop orphaned tool_use/tool_result pairs after trimming',
  ];

  return {
    shouldCompress: should,
    reason: should
      ? `Estimated ~${stats.estimatedTokens.toLocaleString()} tokens across ${stats.messageCount} messages`
      : `Within limits (~${stats.estimatedTokens.toLocaleString()} tokens, ${stats.messageCount} messages)`,
    steps,
    protectedHead: 1,
    protectedTail: 6,
  };
}

/**
 * Produce a compact structured summary from messages slated for removal.
 */
export function buildStructuredSummary(messages: CompressionMessage[]): string {
  const bullets: string[] = [];
  for (const m of messages) {
    if (m.isIntermediate) continue;
    const prefix = m.role === 'user' ? 'User' : m.role === 'assistant' ? 'Assistant' : `Tool:${m.toolName ?? 'unknown'}`;
    const snippet = m.content.length > 200 ? `${m.content.slice(0, 200)}…` : m.content;
    if (snippet.trim()) bullets.push(`- [${prefix}] ${snippet.replace(/\s+/g, ' ').trim()}`);
    if (bullets.length >= 30) break;
  }
  return bullets.join('\n');
}

/**
 * Trim old tool results in-place copy (non-destructive).
 */
export function trimOldToolResults(
  messages: CompressionMessage[],
  keepRecentPairs = 8,
): CompressionMessage[] {
  const result = messages.map(m => ({ ...m }));
  const toolIndices = result
    .map((m, i) => (m.role === 'tool' || m.toolName ? i : -1))
    .filter(i => i >= 0);

  const toTrim = toolIndices.slice(0, Math.max(0, toolIndices.length - keepRecentPairs));
  for (const idx of toTrim) {
    const m = result[idx]!;
    if (m.content.length > 500) {
      m.content = `${m.content.slice(0, 400)}… [trimmed for context budget]`;
    }
  }
  return result;
}
