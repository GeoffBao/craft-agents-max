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
  backgroundReview?: boolean;
  compactionMemoryFlush?: boolean;
  compactionMemoryAutoFlush?: boolean;
  compactionSilentFlush?: boolean;
  dailyMemory?: boolean;
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
    contextCompression: false,
    learningNudge: true,
    backgroundReview: false,
    compactionMemoryFlush: true,
    compactionMemoryAutoFlush: false,
    compactionSilentFlush: false,
    dailyMemory: false,
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
    backgroundReview: block?.backgroundReview ?? defaults.backgroundReview,
    compactionMemoryFlush: block?.compactionMemoryFlush ?? defaults.compactionMemoryFlush,
    compactionMemoryAutoFlush: block?.compactionMemoryAutoFlush ?? defaults.compactionMemoryAutoFlush,
    compactionSilentFlush: block?.compactionSilentFlush ?? defaults.compactionSilentFlush,
    dailyMemory: block?.dailyMemory ?? defaults.dailyMemory,
    heartbeat: block?.heartbeat ?? defaults.heartbeat,
    observability: block?.observability ?? defaults.observability,
  };
}

/**
 * Keep compaction sub-toggles consistent (silent/auto require parent flush hints).
 */
export function applyCompactionSettingsLinkage(
  config: AgentLearningWorkspaceConfig,
  patch?: Partial<AgentLearningWorkspaceConfig>,
): AgentLearningWorkspaceConfig {
  const next = { ...config };

  if (patch?.compactionSilentFlush === true || patch?.compactionMemoryAutoFlush === true) {
    next.compactionMemoryFlush = true;
  }

  if (patch?.compactionMemoryFlush === false) {
    next.compactionMemoryAutoFlush = false;
    next.compactionSilentFlush = false;
  } else if (next.compactionMemoryFlush === false) {
    next.compactionMemoryAutoFlush = false;
    next.compactionSilentFlush = false;
  }

  return next;
}

export function mergeAgentLearningWorkspacePatch(
  current: AgentLearningWorkspaceConfig | undefined,
  patch: Partial<AgentLearningWorkspaceConfig>,
): AgentLearningWorkspaceConfig {
  return applyCompactionSettingsLinkage(
    normalizeAgentLearningWorkspaceConfig({ ...current, ...patch }),
    patch,
  );
}
