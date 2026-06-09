/**
 * Compaction memory flush — extract durable fact candidates before context compression.
 */

export interface CompactionFactCandidate {
  key: string;
  content: string;
  confidence: 'low' | 'medium' | 'high';
}

const PREFERENCE_PATTERNS = [
  /prefer(s)?\s+/i,
  /always\s+use/i,
  /never\s+/i,
  /don't\s+/i,
  /please\s+use/i,
];

export function extractCompactionFactCandidates(
  messages: Array<{ role: string; content: string }>,
): CompactionFactCandidate[] {
  const candidates: CompactionFactCandidate[] = [];

  for (const msg of messages) {
    if (msg.role !== 'user') continue;
    const text = msg.content.trim();
    if (text.length < 20 || text.length > 500) continue;

    if (PREFERENCE_PATTERNS.some(p => p.test(text))) {
      candidates.push({
        key: 'user-preferences',
        content: text,
        confidence: 'medium',
      });
    }
  }

  return candidates.slice(-5);
}
