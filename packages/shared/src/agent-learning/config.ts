/**
 * Agent Learning configuration — feature flags and workspace overrides.
 *
 * Upstream-friendly: all Hermes/OpenClaw migration features gate here.
 * Defaults off; enable via CRAFT_FEATURE_AGENT_LEARNING=1 or workspace config.
 */

import { loadWorkspaceConfig } from '../workspaces/storage.ts';

function getEnv(key: string): string | undefined {
  if (typeof process !== 'undefined' && process.env) return process.env[key];
  return undefined;
}

function parseBooleanEnv(value: string | undefined): boolean | undefined {
  if (value == null) return undefined;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return undefined;
}

export interface AgentLearningWorkspaceConfig {
  /** Master switch for agent learning features. */
  enabled?: boolean;
  persistentMemory?: boolean;
  sessionRecall?: boolean;
  skillDrafts?: boolean;
  promptIntelligence?: boolean;
  contextCompression?: boolean;
  learningNudge?: boolean;
  compactionMemoryFlush?: boolean;
  heartbeat?: boolean;
  observability?: boolean;
}

export interface AgentLearningConfig {
  enabled: boolean;
  persistentMemory: boolean;
  sessionRecall: boolean;
  skillDrafts: boolean;
  promptIntelligence: boolean;
  contextCompression: boolean;
  learningNudge: boolean;
  compactionMemoryFlush: boolean;
  heartbeat: boolean;
  observability: boolean;
}

export const AGENT_LEARNING_TOOL_NAMES = [
  'memory',
  'session_search',
  'skill_view',
  'propose_skill_from_session',
  'skill_manage',
  'compress_context',
] as const;

export type AgentLearningToolName = (typeof AGENT_LEARNING_TOOL_NAMES)[number];

const DEFAULT_CONFIG: AgentLearningConfig = {
  enabled: false,
  persistentMemory: false,
  sessionRecall: false,
  skillDrafts: false,
  promptIntelligence: false,
  contextCompression: false,
  learningNudge: false,
  compactionMemoryFlush: false,
  heartbeat: false,
  observability: false,
};

/**
 * Global env override for agent learning (CRAFT_FEATURE_AGENT_LEARNING=1|0).
 */
export function isAgentLearningEnvEnabled(): boolean | undefined {
  return parseBooleanEnv(getEnv('CRAFT_FEATURE_AGENT_LEARNING'));
}

/**
 * Resolve effective agent learning config for a workspace.
 * Workspace `agentLearning` block overrides per-feature flags when enabled.
 */
export function resolveAgentLearningConfig(workspaceRootPath?: string): AgentLearningConfig {
  const envOverride = isAgentLearningEnvEnabled();
  let workspaceBlock: AgentLearningWorkspaceConfig | undefined;

  if (workspaceRootPath) {
    workspaceBlock = loadWorkspaceConfig(workspaceRootPath)?.agentLearning;
  }

  const masterEnabled = workspaceBlock?.enabled ?? envOverride ?? DEFAULT_CONFIG.enabled;
  if (!masterEnabled) {
    return { ...DEFAULT_CONFIG };
  }

  const flag = (key: keyof Omit<AgentLearningConfig, 'enabled'>): boolean =>
    workspaceBlock?.[key] ?? true;

  return {
    enabled: true,
    persistentMemory: flag('persistentMemory'),
    sessionRecall: flag('sessionRecall'),
    skillDrafts: flag('skillDrafts'),
    promptIntelligence: flag('promptIntelligence'),
    contextCompression: flag('contextCompression'),
    learningNudge: flag('learningNudge'),
    compactionMemoryFlush: flag('compactionMemoryFlush'),
    heartbeat: flag('heartbeat'),
    observability: flag('observability'),
  };
}

/**
 * Return agent-learning tool names that should be exposed for this config.
 */
/** Defaults for workspace UI — sub-features on when master switch is enabled. */
export function defaultAgentLearningWorkspaceConfig(): AgentLearningWorkspaceConfig {
  return {
    enabled: false,
    persistentMemory: true,
    sessionRecall: true,
    skillDrafts: true,
    promptIntelligence: true,
    contextCompression: true,
    learningNudge: true,
    compactionMemoryFlush: true,
    heartbeat: false,
    observability: true,
  };
}

export function normalizeAgentLearningWorkspaceConfig(
  block?: AgentLearningWorkspaceConfig,
): AgentLearningWorkspaceConfig {
  const defaults = defaultAgentLearningWorkspaceConfig();
  return {
    enabled: block?.enabled ?? defaults.enabled,
    persistentMemory: block?.persistentMemory ?? defaults.persistentMemory,
    sessionRecall: block?.sessionRecall ?? defaults.sessionRecall,
    skillDrafts: block?.skillDrafts ?? defaults.skillDrafts,
    promptIntelligence: block?.promptIntelligence ?? defaults.promptIntelligence,
    contextCompression: block?.contextCompression ?? defaults.contextCompression,
    learningNudge: block?.learningNudge ?? defaults.learningNudge,
    compactionMemoryFlush: block?.compactionMemoryFlush ?? defaults.compactionMemoryFlush,
    heartbeat: block?.heartbeat ?? defaults.heartbeat,
    observability: block?.observability ?? defaults.observability,
  };
}

export function mergeAgentLearningWorkspacePatch(
  current: AgentLearningWorkspaceConfig | undefined,
  patch: Partial<AgentLearningWorkspaceConfig>,
): AgentLearningWorkspaceConfig {
  return normalizeAgentLearningWorkspaceConfig({ ...current, ...patch });
}

export function getEnabledAgentLearningTools(config: AgentLearningConfig): Set<AgentLearningToolName> {
  const tools = new Set<AgentLearningToolName>();
  if (!config.enabled) return tools;
  if (config.persistentMemory) tools.add('memory');
  if (config.sessionRecall) tools.add('session_search');
  if (config.promptIntelligence || config.skillDrafts) tools.add('skill_view');
  if (config.skillDrafts) {
    tools.add('propose_skill_from_session');
    tools.add('skill_manage');
  }
  if (config.contextCompression) tools.add('compress_context');
  return tools;
}
