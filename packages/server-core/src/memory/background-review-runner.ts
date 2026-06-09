/**
 * Fire-and-forget background review after completed turns.
 */

import { resolveAgentLearningConfig } from '@craft-agent/shared/agent-learning';
import {
  buildBackgroundReviewPrompt,
  parseBackgroundReviewResponse,
  shouldRunBackgroundReview,
  hasActionableLearningSuggestion,
  type BackgroundReviewSuggestion,
} from '@craft-agent/shared/agent-learning';
import { logAgentLearningEvent } from './observability.ts';

interface ReviewAgent {
  runMiniCompletion(prompt: string): Promise<string | null>;
}

export async function runBackgroundReviewIfEnabled(params: {
  workspaceRootPath: string;
  sessionId: string;
  messages: Array<{ role: string; content: string }>;
  agent: ReviewAgent | null | undefined;
}): Promise<BackgroundReviewSuggestion | null> {
  const cfg = resolveAgentLearningConfig(params.workspaceRootPath);
  if (!cfg.enabled || !cfg.learningNudge) return null;
  if (!params.agent) return null;
  if (!shouldRunBackgroundReview(params.messages.length)) return null;

  const recent = params.messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => ({ role: m.role, content: m.content }));

  const prompt = buildBackgroundReviewPrompt({
    sessionId: params.sessionId,
    recentMessages: recent,
  });

  try {
    const raw = await params.agent.runMiniCompletion(prompt);
    const suggestion = parseBackgroundReviewResponse(raw);
    if (!suggestion || !hasActionableLearningSuggestion(suggestion)) return null;

    if (cfg.observability) {
      logAgentLearningEvent({
        type: 'learning_nudge',
        sessionId: params.sessionId,
        payload: { source: 'background_review', ...suggestion },
      });
    }

    return suggestion;
  } catch {
    return null;
  }
}
