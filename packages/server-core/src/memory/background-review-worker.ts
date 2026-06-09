/**
 * Isolated background review worker — ephemeral headless mini-agent per review.
 *
 * Avoids borrowing the live session agent (which may be busy or hold session state).
 */

import { resolveAgentLearningConfig } from '@craft-agent/shared/agent-learning';
import type { BackgroundReviewSuggestion } from '@craft-agent/shared/agent-learning';
import { getDefaultSummarizationModel } from '@craft-agent/shared/config/models';
import { getMiniModel } from '@craft-agent/shared/config';
import { loadWorkspaceConfig } from '@craft-agent/shared/workspaces';
import {
  createBackendFromResolvedContext,
  resolveBackendContext,
  type BackendHostRuntimeContext,
} from '@craft-agent/shared/agent/backend';
import type { Workspace } from '@craft-agent/shared/config';
import { runBackgroundReviewIfEnabled } from './background-review-runner.ts';

export interface BackgroundReviewWorkerParams {
  workspace: Workspace;
  sessionId: string;
  messages: Array<{ role: string; content: string }>;
  llmConnection?: string;
  model?: string;
  workingDirectory?: string;
  sdkCwd?: string;
  buildHostRuntime: () => BackendHostRuntimeContext;
}

export async function runBackgroundReviewInWorker(
  params: BackgroundReviewWorkerParams,
): Promise<BackgroundReviewSuggestion | null> {
  const workspaceRootPath = params.workspace.rootPath;
  const cfg = resolveAgentLearningConfig(workspaceRootPath);
  if (!cfg.enabled || !cfg.learningNudge) return null;

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
        id: `${params.sessionId}-bg-review`,
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

  try {
    return await runBackgroundReviewIfEnabled({
      workspaceRootPath,
      sessionId: params.sessionId,
      messages: params.messages,
      agent,
    });
  } finally {
    agent.destroy();
  }
}
