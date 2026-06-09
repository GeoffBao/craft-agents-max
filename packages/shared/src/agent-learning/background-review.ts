/**
 * Background review — Hermes-style post-turn learning assessment (suggest only).
 */

export interface BackgroundReviewInput {
  sessionId: string;
  recentMessages: Array<{ role: string; content: string }>;
}

export interface BackgroundReviewSuggestion {
  suggestMemory: boolean;
  memoryReason?: string;
  memoryKey?: string;
  memoryDraft?: string;
  suggestSkill: boolean;
  skillReason?: string;
  skillTitle?: string;
}

export function buildBackgroundReviewPrompt(input: BackgroundReviewInput): string {
  const transcript = input.recentMessages
    .slice(-6)
    .map(m => `[${m.role}]: ${m.content.slice(0, 800)}`)
    .join('\n\n');

  return `You are a background learning reviewer. Analyze this recent conversation excerpt and decide if durable memory or a skill draft is warranted.

Rules:
- Suggest memory only for stable user preferences, project decisions, or recurring constraints.
- Suggest skill only for repeatable multi-step workflows that succeeded.
- Never suggest storing secrets, tokens, or one-off task completion notes.
- Do NOT write files — only return JSON.

Conversation:
${transcript}

Respond with JSON only:
{
  "suggestMemory": boolean,
  "memoryReason": string,
  "memoryKey": string,
  "memoryDraft": string,
  "suggestSkill": boolean,
  "skillReason": string,
  "skillTitle": string
}`;
}

export function parseBackgroundReviewResponse(text: string | null): BackgroundReviewSuggestion | null {
  if (!text?.trim()) return null;
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]) as Partial<BackgroundReviewSuggestion>;
    return {
      suggestMemory: Boolean(parsed.suggestMemory),
      memoryReason: parsed.memoryReason,
      memoryKey: parsed.memoryKey,
      memoryDraft: parsed.memoryDraft,
      suggestSkill: Boolean(parsed.suggestSkill),
      skillReason: parsed.skillReason,
      skillTitle: parsed.skillTitle,
    };
  } catch {
    return null;
  }
}

export function shouldRunBackgroundReview(messageCount: number, minMessages = 6): boolean {
  return messageCount >= minMessages;
}

/** User-visible info line when review suggests persistence (not auto-applied). */
export function formatLearningNudgeInfoMessage(suggestion: BackgroundReviewSuggestion): string | null {
  const parts: string[] = [];
  if (suggestion.suggestMemory) {
    const detail = suggestion.memoryReason || suggestion.memoryKey || 'durable fact';
    parts.push(`memory: ${detail}`);
  }
  if (suggestion.suggestSkill) {
    const detail = suggestion.skillReason || suggestion.skillTitle || 'repeatable workflow';
    parts.push(`skill draft: ${detail}`);
  }
  if (parts.length === 0) return null;
  return `Learning review — ${parts.join(' · ')}. Use \`memory\`, \`propose_skill_from_session\`, or \`skill_manage\` if you want to save (not auto-written).`;
}

export function hasActionableLearningSuggestion(suggestion: BackgroundReviewSuggestion): boolean {
  return suggestion.suggestMemory || suggestion.suggestSkill;
}
