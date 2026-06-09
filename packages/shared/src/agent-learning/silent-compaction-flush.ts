/**
 * Silent compaction memory flush — OpenClaw-style mini-agent turn before compaction.
 */

export interface SilentFlushWrite {
  target: 'memory' | 'daily';
  key?: string;
  content: string;
}

export interface SilentFlushResult {
  noReply: boolean;
  writes: SilentFlushWrite[];
}

export function buildSilentCompactionFlushPrompt(input: {
  sessionId: string;
  recentMessages: Array<{ role: string; content: string }>;
  dailyMemoryEnabled: boolean;
}): string {
  const transcript = input.recentMessages
    .slice(-12)
    .map(m => `[${m.role}]: ${m.content.slice(0, 600)}`)
    .join('\n\n');

  const targets = input.dailyMemoryEnabled
    ? '`memory` (long-term MEMORY.md) or `daily` (today\'s journal)'
    : '`memory` (long-term MEMORY.md)';

  return `You are a silent memory flush agent. Context compaction is imminent — persist durable facts before they are summarized away.

Rules:
- Write only stable user preferences, project decisions, or recurring constraints.
- Never store secrets, tokens, API keys, or one-off task notes.
- Use target ${targets}.
- For daily journal, prefer session-specific notes; use memory for cross-session facts.
- If nothing durable warrants persistence, respond exactly: NO_REPLY
- Otherwise respond with JSON only (max 3 writes):

{
  "writes": [
    { "target": "memory" | "daily", "key": "optional-section", "content": "fact text" }
  ]
}

Session: ${input.sessionId}

Conversation excerpt:
${transcript}`;
}

export function parseSilentCompactionFlushResponse(text: string | null): SilentFlushResult | null {
  if (!text?.trim()) return null;
  const trimmed = text.trim();
  if (/^NO_REPLY$/i.test(trimmed)) {
    return { noReply: true, writes: [] };
  }

  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]) as { writes?: Array<Partial<SilentFlushWrite>> };
    const writes: SilentFlushWrite[] = [];
    for (const w of parsed.writes ?? []) {
      if (!w?.content?.trim()) continue;
      if (w.target !== 'memory' && w.target !== 'daily') continue;
      writes.push({
        target: w.target,
        key: w.key?.trim() || undefined,
        content: w.content.trim().slice(0, 4000),
      });
      if (writes.length >= 3) break;
    }
    if (writes.length === 0) return { noReply: true, writes: [] };
    return { noReply: false, writes };
  } catch {
    return null;
  }
}
