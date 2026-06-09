/**
 * Agent Learning configuration — feature flags and workspace overrides.
 *
 * Upstream-friendly: all Hermes/OpenClaw migration features gate here.
 * Defaults off; enable via CRAFT_FEATURE_AGENT_LEARNING=1 or workspace config.
 */

import { loadWorkspaceConfig } from '../workspaces/storage.ts';
import {
  type AgentLearningWorkspaceConfig,
  defaultAgentLearningWorkspaceConfig,
  normalizeAgentLearningWorkspaceConfig,
  mergeAgentLearningWorkspacePatch,
} from './workspace-settings.ts';

export type { AgentLearningWorkspaceConfig };
export {
  defaultAgentLearningWorkspaceConfig,
  normalizeAgentLearningWorkspaceConfig,
  mergeAgentLearningWorkspacePatch,
};

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

export interface AgentLearningConfig {
  enabled: boolean;
  persistentMemory: boolean;
  sessionRecall: boolean;
  skillDrafts: boolean;
  promptIntelligence: boolean;
  contextCompression: boolean;
  learningNudge: boolean;
  backgroundReview: boolean;
  compactionMemoryFlush: boolean;
  compactionMemoryAutoFlush: boolean;
  compactionSilentFlush: boolean;
  dailyMemory: boolean;
  heartbeat: boolean;
  observability: boolean;
}

export const AGENT_LEARNING_TOOL_NAMES = [
  'memory',
  'memory_search',
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
  backgroundReview: false,
  compactionMemoryFlush: false,
  compactionMemoryAutoFlush: false,
  compactionSilentFlush: false,
  dailyMemory: false,
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

  const defaults = defaultAgentLearningWorkspaceConfig();
  const optInFlags = new Set<keyof AgentLearningWorkspaceConfig>([
    'compactionMemoryAutoFlush',
    'compactionSilentFlush',
    'dailyMemory',
    'heartbeat',
  ]);

  const flag = (key: keyof Omit<AgentLearningConfig, 'enabled'>): boolean => {
    if (workspaceBlock?.[key] !== undefined) return Boolean(workspaceBlock[key]);
    if (optInFlags.has(key as keyof AgentLearningWorkspaceConfig)) {
      return Boolean(defaults[key as keyof AgentLearningWorkspaceConfig]);
    }
    return true;
  };

  let compactionMemoryFlush = flag('compactionMemoryFlush');
  let compactionMemoryAutoFlush = flag('compactionMemoryAutoFlush');
  let compactionSilentFlush = flag('compactionSilentFlush');

  if ((compactionSilentFlush || compactionMemoryAutoFlush) && !compactionMemoryFlush) {
    compactionMemoryFlush = true;
  }
  if (!compactionMemoryFlush) {
    compactionMemoryAutoFlush = false;
    compactionSilentFlush = false;
  }

  return {
    enabled: true,
    persistentMemory: flag('persistentMemory'),
    sessionRecall: flag('sessionRecall'),
    skillDrafts: flag('skillDrafts'),
    promptIntelligence: flag('promptIntelligence'),
    contextCompression: flag('contextCompression'),
    learningNudge: flag('learningNudge'),
    backgroundReview: flag('backgroundReview'),
    compactionMemoryFlush,
    compactionMemoryAutoFlush,
    compactionSilentFlush,
    dailyMemory: flag('dailyMemory'),
    heartbeat: flag('heartbeat'),
    observability: flag('observability'),
  };
}

export function getEnabledAgentLearningTools(config: AgentLearningConfig): Set<AgentLearningToolName> {
  const tools = new Set<AgentLearningToolName>();
  if (!config.enabled) return tools;
  if (config.persistentMemory) {
    tools.add('memory');
    tools.add('memory_search');
  }
  if (config.sessionRecall) tools.add('session_search');
  if (config.promptIntelligence || config.skillDrafts) tools.add('skill_view');
  if (config.skillDrafts) {
    tools.add('propose_skill_from_session');
    tools.add('skill_manage');
  }
  if (config.contextCompression) tools.add('compress_context');
  return tools;
}
