/**
 * Silent compaction memory flush — applies durable writes before context compaction.
 */

import {
  resolveAgentLearningConfig,
  buildSilentCompactionFlushPrompt,
  parseSilentCompactionFlushResponse,
  type SilentFlushResult,
} from '@craft-agent/shared/agent-learning';
import { applyMemoryOperation } from '@craft-agent/shared/memory';
import { logAgentLearningEvent } from './observability.ts';

interface FlushAgent {
  runMiniCompletion(prompt: string): Promise<string | null>;
}

export interface SilentCompactionFlushOutcome {
  result: SilentFlushResult | null;
  appliedKeys: string[];
}

export async function runSilentCompactionFlushIfEnabled(params: {
  workspaceRootPath: string;
  sessionId: string;
  messages: Array<{ role: string; content: string }>;
  agent: FlushAgent | null | undefined;
}): Promise<SilentCompactionFlushOutcome> {
  const cfg = resolveAgentLearningConfig(params.workspaceRootPath);
  if (!cfg.enabled || !cfg.compactionMemoryFlush || !cfg.compactionSilentFlush) {
    return { result: null, appliedKeys: [] };
  }
  if (!params.agent || params.messages.length < 4) {
    return { result: null, appliedKeys: [] };
  }

  const recent = params.messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => ({ role: m.role, content: m.content }));

  const prompt = buildSilentCompactionFlushPrompt({
    sessionId: params.sessionId,
    recentMessages: recent,
    dailyMemoryEnabled: cfg.dailyMemory,
  });

  try {
    const raw = await params.agent.runMiniCompletion(prompt);
    const result = parseSilentCompactionFlushResponse(raw);
    if (!result || result.noReply || result.writes.length === 0) {
      if (cfg.observability) {
        logAgentLearningEvent({
          type: 'compaction_flush',
          sessionId: params.sessionId,
          payload: { source: 'silent_flush', noReply: true },
        });
      }
      return { result: result ?? { noReply: true, writes: [] }, appliedKeys: [] };
    }

    const appliedKeys: string[] = [];
    for (const write of result.writes) {
      const op = applyMemoryOperation(
        params.workspaceRootPath,
        'add',
        write.target,
        write.content,
        write.key,
      );
      if (op.ok) {
        appliedKeys.push(write.key ?? write.target);
        if (cfg.observability) {
          logAgentLearningEvent({
            type: write.target === 'daily' ? 'daily_memory_write' : 'memory_write',
            sessionId: params.sessionId,
            payload: {
              source: 'silent_flush',
              target: write.target,
              key: write.key,
            },
          });
        }
      }
    }

    if (cfg.observability) {
      logAgentLearningEvent({
        type: 'compaction_flush',
        sessionId: params.sessionId,
        payload: { source: 'silent_flush', applied: appliedKeys },
      });
    }

    return { result, appliedKeys };
  } catch (err) {
    console.error('[agent-learning] silent compaction flush error:', err);
    if (cfg.observability) {
      logAgentLearningEvent({
        type: 'compaction_flush',
        sessionId: params.sessionId,
        payload: { source: 'silent_flush', error: err instanceof Error ? err.message : String(err) },
      });
    }
    return { result: null, appliedKeys: [] };
  }
}
