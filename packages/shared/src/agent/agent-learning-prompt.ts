/**
 * Build frozen agent-learning prompt appendix (memory snapshot + intelligence guidance).
 */

import {
  resolveAgentLearningConfig,
  getEnabledAgentLearningTools,
  type AgentLearningConfig,
} from '../agent-learning/config.ts';
import { loadMemorySnapshot, formatMemorySnapshotForPrompt } from '../memory/storage.ts';
import {
  buildIntelligenceGuidance,
  buildSkillsIndexPrompt,
} from './intelligence-guidance.ts';
import { composePinnedAgentLearningAppendix } from '../agent-learning/prompt-layers.ts';
import { loadAllSkills } from '../skills/storage.ts';

export interface AgentLearningPromptParams {
  workspaceRootPath: string;
  providerId?: string;
  modelId?: string;
  backendName?: string;
  workingDirectory?: string;
}

export interface AgentLearningPromptBundle {
  config: AgentLearningConfig;
  appendix: string;
  enabledTools: Set<string>;
}

/**
 * Build the full agent-learning appendix. Call once per agent instance and pin the result.
 */
export function buildAgentLearningPromptBundle(
  params: AgentLearningPromptParams,
): AgentLearningPromptBundle {
  const config = resolveAgentLearningConfig(params.workspaceRootPath);
  const enabledTools = getEnabledAgentLearningTools(config);

  if (!config.enabled) {
    return { config, appendix: '', enabledTools };
  }

  let memoryBlock = '';
  if (config.persistentMemory) {
    const snapshot = loadMemorySnapshot(params.workspaceRootPath, {
      dailyMemory: config.dailyMemory,
    });
    memoryBlock = formatMemorySnapshotForPrompt(snapshot);
  }

  let intelligenceBlock = '';
  if (config.promptIntelligence) {
    const skills = loadAllSkills(
      params.workspaceRootPath,
      params.workingDirectory,
    );
    const skillsIndex = buildSkillsIndexPrompt(
      skills.map(s => ({
        name: s.metadata.name,
        description: s.metadata.description,
        slug: s.slug,
      })),
    );
    intelligenceBlock = buildIntelligenceGuidance({
      availableTools: enabledTools,
      providerId: params.providerId,
      modelId: params.modelId,
      skillsIndex,
      backendName: params.backendName,
    });
  }

  const appendix = composePinnedAgentLearningAppendix({
    stable: memoryBlock,
    context: intelligenceBlock,
    volatile: '',
  });

  return { config, appendix, enabledTools };
}
