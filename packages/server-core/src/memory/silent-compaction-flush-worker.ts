/**
 * Isolated mini-agent worker for silent compaction memory flush.
 */

import { resolveAgentLearningConfig } from '@craft-agent/shared/agent-learning';
import { getDefaultSummarizationModel } from '@craft-agent/shared/config/models';
import { getMiniModel } from '@craft-agent/shared/config';
import { loadWorkspaceConfig } from '@craft-agent/shared/workspaces';
import {
  createBackendFromResolvedContext,
  resolveBackendContext,
  type BackendHostRuntimeContext,
} from '@craft-agent/shared/agent/backend';
import type { Workspace } from '@craft-agent/shared/config';
import {
  runSilentCompactionFlushIfEnabled,
  type SilentCompactionFlushOutcome,
} from './silent-compaction-flush-runner.ts';

export interface SilentCompactionFlushWorkerParams {
  workspace: Workspace;
  sessionId: string;
  messages: Array<{ role: string; content: string }>;
  llmConnection?: string;
  model?: string;
  workingDirectory?: string;
  sdkCwd?: string;
  buildHostRuntime: () => BackendHostRuntimeContext;
}

export async function runSilentCompactionFlushInWorker(
  params: SilentCompactionFlushWorkerParams,
): Promise<SilentCompactionFlushOutcome> {
  const workspaceRootPath = params.workspace.rootPath;
  const cfg = resolveAgentLearningConfig(workspaceRootPath);
  if (!cfg.enabled || !cfg.compactionMemoryFlush || !cfg.compactionSilentFlush) {
    return { result: null, appliedKeys: [] };
  }

  const wsConfig = loadWorkspaceConfig(workspaceRootPath);
  const defaultModel = wsConfig?.defaults?.model;
  const backendContext = resolveBackendContext({
    sessionConnectionSlug: params.llmConnection,
    workspaceDefaultConnectionSlug: wsConfig?.defaults?.defaultLlmConnection,
    managedModel: params.model || defaultModel,
  });

  const miniModel = backendContext.connection
    ? (getMiniModel(backendContext.connection)
      ?? backendContext.connection.defaultModel
      ?? getDefaultSummarizationModel())
    : getDefaultSummarizationModel();

  const envOverrides: Record<string, string> = {
    CRAFT_WORKSPACE_PATH: workspaceRootPath,
    ...(miniModel ? { ANTHROPIC_DEFAULT_HAIKU_MODEL: miniModel } : {}),
  };

  const agent = createBackendFromResolvedContext({
    context: backendContext,
    hostRuntime: params.buildHostRuntime(),
    coreConfig: {
      workspace: params.workspace,
      session: {
        id: `${params.sessionId}-silent-flush`,
        workspaceRootPath,
        createdAt: Date.now(),
        lastUsedAt: Date.now(),
        workingDirectory: params.workingDirectory,
        sdkCwd: params.sdkCwd,
        model: params.model,
        llmConnection: params.llmConnection,
        permissionMode: 'safe',
      },
      miniModel,
      envOverrides,
      isHeadless: true,
    },
    providerOptions: { piAuthProvider: backendContext.connection?.piAuthProvider },
  });

  const FLUSH_TIMEOUT_MS = 45_000;

  try {
    const work = runSilentCompactionFlushIfEnabled({
      workspaceRootPath,
      sessionId: params.sessionId,
      messages: params.messages,
      agent,
    });
    const timeout = new Promise<SilentCompactionFlushOutcome>((resolve) => {
      setTimeout(() => resolve({ result: null, appliedKeys: [] }), FLUSH_TIMEOUT_MS);
    });
    return await Promise.race([work, timeout]);
  } finally {
    agent.destroy();
  }
}
