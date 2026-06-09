/**
 * Learning nudge — candidates for memory/skill writes after session events.
 *
 * Default: suggest only; does not auto-write to MEMORY.md or skills.
 */

export type LearningNudgeKind = 'memory' | 'skill' | 'both';

export interface LearningNudgeCandidate {
  kind: LearningNudgeKind;
  reason: string;
  suggestedMemoryKey?: string;
  suggestedSkillTitle?: string;
  sessionId: string;
  createdAt: number;
}

export interface LearningNudgeInput {
  sessionId: string;
  event: 'SessionEnd' | 'PreCompact' | 'PostToolUseFailure';
  toolName?: string;
  messageCount?: number;
  hadSuccessfulMultiStepFix?: boolean;
  userCorrectionCount?: number;
}

export function evaluateLearningNudge(input: LearningNudgeInput): LearningNudgeCandidate | null {
  const base = { sessionId: input.sessionId, createdAt: Date.now() };

  if (input.event === 'PostToolUseFailure' && input.toolName) {
    return null; // failures alone don't warrant memory writes
  }

  if (input.hadSuccessfulMultiStepFix) {
    return {
      ...base,
      kind: 'skill',
      reason: 'Multi-step debugging completed successfully — workflow may be worth a skill draft.',
      suggestedSkillTitle: 'debug-workflow',
    };
  }

  if ((input.userCorrectionCount ?? 0) >= 2) {
    return {
      ...base,
      kind: 'memory',
      reason: 'Repeated user corrections detected — preference may belong in long-term memory.',
      suggestedMemoryKey: 'user-preferences',
    };
  }

  if (input.event === 'PreCompact' && (input.messageCount ?? 0) > 40) {
    return {
      ...base,
      kind: 'memory',
      reason: 'Compaction imminent — extract durable facts before context is summarized.',
      suggestedMemoryKey: 'session-decisions',
    };
  }

  if (input.event === 'SessionEnd' && (input.messageCount ?? 0) > 20) {
    return {
      ...base,
      kind: 'both',
      reason: 'Substantive session ended — review whether facts or workflows should be persisted.',
    };
  }

  return null;
}

export function formatLearningNudgeForLog(candidate: LearningNudgeCandidate): string {
  return `[learning-nudge] session=${candidate.sessionId} kind=${candidate.kind} reason=${candidate.reason}`;
}

/** User-visible info line for PreCompact / SessionEnd nudges (suggest-only). */
export function formatLearningNudgeCandidateInfoMessage(candidate: LearningNudgeCandidate): string {
  const toolHint =
    candidate.kind === 'memory'
      ? '`memory`'
      : candidate.kind === 'skill'
        ? '`propose_skill_from_session` or `skill_manage`'
        : '`memory` or `propose_skill_from_session`';
  return `Learning nudge — ${candidate.reason} Use ${toolHint} if you want to save (not auto-written).`;
}
