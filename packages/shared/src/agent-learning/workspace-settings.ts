/**
 * Agent learning workspace settings — pure helpers for Settings UI (no Node/fs deps).
 */

export interface AgentLearningWorkspaceConfig {
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
