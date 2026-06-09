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

export const DEFAULT_TOKEN_THRESHOLD = 80_000;
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

export interface ApplyContextCompressionResult {
  messages: CompressionMessage[];
  trimmedCount: number;
  middleCollapsed: boolean;
  summaryLines: number;
  plan: CompressionPlan;
}

/**
 * Apply in-session compression: trim old tool results, then collapse middle turns into a summary block.
 */
export function applyContextCompression(
  messages: CompressionMessage[],
  tokenThreshold = DEFAULT_TOKEN_THRESHOLD,
): ApplyContextCompressionResult {
  const plan = shouldCompress(messages, tokenThreshold);
  if (!plan.shouldCompress) {
    return {
      messages,
      trimmedCount: 0,
      middleCollapsed: false,
      summaryLines: 0,
      plan,
    };
  }

  const trimmed = trimOldToolResults(messages);
  let trimmedCount = 0;
  for (let i = 0; i < messages.length; i++) {
    if (messages[i]?.content !== trimmed[i]?.content) trimmedCount++;
  }

  const tail = plan.protectedTail;
  if (trimmed.length <= plan.protectedHead + tail) {
    return {
      messages: trimmed,
      trimmedCount,
      middleCollapsed: false,
      summaryLines: 0,
      plan,
    };
  }

  const middle = trimmed.slice(plan.protectedHead, trimmed.length - tail);
  const summary = buildStructuredSummary(middle);
  if (!summary.trim()) {
    return {
      messages: trimmed,
      trimmedCount,
      middleCollapsed: false,
      summaryLines: 0,
      plan,
    };
  }

  const summaryMessage: CompressionMessage = {
    role: 'assistant',
    content: `<context_compression_summary>\n${summary}\n</context_compression_summary>`,
    isIntermediate: false,
  };

  return {
    messages: [
      ...trimmed.slice(0, plan.protectedHead),
      summaryMessage,
      ...trimmed.slice(trimmed.length - tail),
    ],
    trimmedCount,
    middleCollapsed: true,
    summaryLines: summary.split('\n').filter(Boolean).length,
    plan,
  };
}
