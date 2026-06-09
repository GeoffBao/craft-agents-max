/**
 * Agent-learning prompt layering — stable / context / volatile / ephemeral.
 *
 * Stable + context are pinned per agent instance (session start).
 * Volatile + ephemeral are injected per turn elsewhere (user message blocks).
 */

export interface AgentLearningPromptLayers {
  stable: string;
  context: string;
  volatile: string;
}

export function wrapStableLayer(block: string): string {
  if (!block.trim()) return '';
  return `\n\n<agent_learning_stable>\n${block.trim()}\n</agent_learning_stable>`;
}

export function wrapContextLayer(block: string): string {
  if (!block.trim()) return '';
  return `\n\n<agent_learning_context>\n${block.trim()}\n</agent_learning_context>`;
}

export function wrapVolatileLayer(block: string): string {
  if (!block.trim()) return '';
  return `\n\n<agent_learning_volatile>\n${block.trim()}\n</agent_learning_volatile>`;
}

/**
 * Compose pinned appendix from stable + context layers.
 * Volatile/ephemeral are intentionally excluded (per-turn injection).
 */
export function composePinnedAgentLearningAppendix(layers: AgentLearningPromptLayers): string {
  const stable = wrapStableLayer(layers.stable);
  const context = wrapContextLayer(layers.context);
  const combined = `${stable}${context}`;
  if (!combined.trim()) return '';
  return `\n\n<agent_learning_layers>${combined}\n</agent_learning_layers>`;
}
