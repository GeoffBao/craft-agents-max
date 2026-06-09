/**
 * SessionManager hooks for agent-learning features.
 */

import {
  resolveAgentLearningConfig,
  evaluateLearningNudge,
  formatLearningNudgeForLog,
  formatLearningNudgeCandidateInfoMessage,
  extractCompactionFactCandidates,
  detectHadSuccessfulMultiStepFix,
} from '@craft-agent/shared/agent-learning';
import { applyMemoryOperation } from '@craft-agent/shared/memory';
import { getSessionIndexManager } from './session-indexer.ts';
import { searchSessions } from './session-search.ts';
import { logAgentLearningEvent } from './observability.ts';

export function indexSessionForRecall(workspaceRootPath: string, sessionId: string): void {
  const cfg = resolveAgentLearningConfig(workspaceRootPath);
  if (!cfg.enabled || !cfg.sessionRecall) return;
  try {
    getSessionIndexManager(workspaceRootPath).indexSession(sessionId);
  } catch {
    // Index is derived — ignore failures
  }
}

export function emitSessionEndLearningSignals(
  workspaceRootPath: string,
  sessionId: string,
  messages: Array<{ role: string; content: string; isIntermediate?: boolean }>,
): void {
  const cfg = resolveAgentLearningConfig(workspaceRootPath);
  if (!cfg.enabled) return;

  indexSessionForRecall(workspaceRootPath, sessionId);

  if (cfg.observability) {
    logAgentLearningEvent({
      type: 'heartbeat',
      sessionId,
      payload: { event: 'session_end_indexed' },
    });
  }

  if (cfg.learningNudge) {
    const userMessages = messages.filter(m => m.role === 'user' && !m.isIntermediate);
    const nudge = evaluateLearningNudge({
      sessionId,
      event: 'SessionEnd',
      messageCount: messages.length,
      userCorrectionCount: userMessages.filter(m => /no,|wrong|instead|prefer/i.test(m.content)).length,
      hadSuccessfulMultiStepFix: detectHadSuccessfulMultiStepFix(messages),
    });
    if (nudge && cfg.observability) {
      logAgentLearningEvent({
        type: 'learning_nudge',
        sessionId,
        payload: { ...nudge },
      });
      console.info(formatLearningNudgeForLog(nudge));
    }
  }

  if (cfg.compactionMemoryFlush) {
    const facts = extractCompactionFactCandidates(messages);
    if (facts.length > 0 && cfg.observability) {
      logAgentLearningEvent({
        type: 'compaction_flush',
        sessionId,
        payload: { candidates: facts },
      });
    }
  }
}

/**
 * Pre-compaction learning hint — surfaced as session info when compaction starts.
 * Returns null when agent learning is off or nothing actionable.
 */
export function evaluatePreCompactLearningInfoMessage(
  workspaceRootPath: string,
  sessionId: string,
  messages: Array<{ role: string; content: string; isIntermediate?: boolean }>,
): string | null {
  const cfg = resolveAgentLearningConfig(workspaceRootPath);
  if (!cfg.enabled) return null;

  let infoMessage: string | null = null;

  if (cfg.learningNudge) {
    const nudge = evaluateLearningNudge({
      sessionId,
      event: 'PreCompact',
      messageCount: messages.length,
      hadSuccessfulMultiStepFix: detectHadSuccessfulMultiStepFix(messages),
    });
    if (nudge) {
      infoMessage = formatLearningNudgeCandidateInfoMessage(nudge);
      if (cfg.observability) {
        logAgentLearningEvent({
          type: 'learning_nudge',
          sessionId,
          payload: { source: 'pre_compact', ...nudge },
        });
        console.info(formatLearningNudgeForLog(nudge));
      }
    }
  }

  if (cfg.compactionMemoryFlush) {
    const facts = extractCompactionFactCandidates(messages);
    if (facts.length > 0) {
      if (cfg.observability) {
        logAgentLearningEvent({
          type: 'compaction_flush',
          sessionId,
          payload: { source: 'pre_compact', candidates: facts },
        });
      }
      if (cfg.compactionMemoryAutoFlush) {
        const written: string[] = [];
        for (const fact of facts.slice(-2)) {
          const result = applyMemoryOperation(
            workspaceRootPath,
            'add',
            'memory',
            fact.content,
            fact.key,
          );
          if (result.ok) written.push(fact.key);
        }
        if (written.length > 0) {
          infoMessage =
            `Compaction soon — auto-wrote ${written.length} fact(s) to MEMORY.md (${written.join(', ')}).`;
          if (cfg.observability) {
            logAgentLearningEvent({
              type: 'memory_write',
              sessionId,
              payload: { source: 'compaction_auto_flush', keys: written },
            });
          }
        }
      } else if (!infoMessage) {
        infoMessage =
          `Compaction soon — ${facts.length} durable fact candidate(s) detected. ` +
          'Use `memory` before context is summarized (not auto-written).';
      }
    }
  }

  return infoMessage;
}

/**
 * Session-end learning hint — same rules as PreCompact, for archive/delete UI surfacing.
 */
export function evaluateSessionEndLearningInfoMessage(
  workspaceRootPath: string,
  sessionId: string,
  messages: Array<{ role: string; content: string; isIntermediate?: boolean }>,
): string | null {
  const cfg = resolveAgentLearningConfig(workspaceRootPath);
  if (!cfg.enabled || !cfg.learningNudge) return null;

  const userMessages = messages.filter(m => m.role === 'user' && !m.isIntermediate);
  const nudge = evaluateLearningNudge({
    sessionId,
    event: 'SessionEnd',
    messageCount: messages.length,
    userCorrectionCount: userMessages.filter(m => /no,|wrong|instead|prefer/i.test(m.content)).length,
    hadSuccessfulMultiStepFix: detectHadSuccessfulMultiStepFix(messages),
  });
  if (!nudge) return null;

  if (cfg.observability) {
    logAgentLearningEvent({
      type: 'learning_nudge',
      sessionId,
      payload: { source: 'session_end', ...nudge },
    });
    console.info(formatLearningNudgeForLog(nudge));
  }

  return formatLearningNudgeCandidateInfoMessage(nudge);
}

export function createSessionSearchFn(workspaceRootPath: string) {
  return async (options: {
    query: string;
    limit?: number;
    sessionId?: string;
    cursor?: string;
    workspacePath: string;
  }) => {
    const cfg = resolveAgentLearningConfig(workspaceRootPath);
    if (!cfg.enabled || !cfg.sessionRecall) {
      throw new Error('session_search is disabled for this workspace.');
    }
    if (options.sessionId) {
      indexSessionForRecall(workspaceRootPath, options.sessionId);
    }
    const result = searchSessions({
      ...options,
      workspacePath: workspaceRootPath,
    });
    if (cfg.observability) {
      logAgentLearningEvent({
        type: 'session_search',
        payload: { query: options.query, hitCount: result.hits.length },
      });
    }
    return result;
  };
}
