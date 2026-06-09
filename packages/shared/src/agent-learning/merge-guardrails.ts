/**
 * Upstream merge guardrails for agent-learning migrations.
 *
 * Checklist helpers — run after upstream sync to verify isolated boundaries.
 */

export const AGENT_LEARNING_BOUNDARY_MODULES = [
  'packages/shared/src/agent-learning/',
  'packages/shared/src/memory/',
  'packages/shared/src/agent/intelligence-guidance.ts',
  'packages/shared/src/agent/context-compression.ts',
  'packages/server-core/src/memory/',
] as const;

export const AGENT_LEARNING_HOT_PATH_TOUCHPOINTS = [
  'packages/shared/src/prompts/system.ts — single append splice',
  'packages/shared/src/agent/claude-agent.ts — pinned learning appendix',
  'packages/shared/src/agent/pi-agent.ts — pinned learning appendix',
  'packages/session-tools-core/src/tool-defs.ts — registry entries only',
  'packages/server-core/src/sessions/SessionManager.ts — callback merge + indexer',
] as const;

export const AGENT_LEARNING_VERIFY_COMMANDS = [
  'cd packages/shared && bun run tsc --noEmit',
  'cd packages/server-core && bun run typecheck',
  'bun test packages/shared/src/agent/__tests__/intelligence-guidance.test.ts',
  'bun test packages/shared/src/memory/__tests__/storage.test.ts',
  'bun test packages/shared/src/agent-learning/__tests__/config.test.ts',
] as const;

export interface MergeGuardrailReport {
  boundaries: readonly string[];
  hotPaths: readonly string[];
  verifyCommands: readonly string[];
  featureFlag: 'CRAFT_FEATURE_AGENT_LEARNING=1|0 or workspace.agentLearning.enabled';
}

export function getMergeGuardrailReport(): MergeGuardrailReport {
  return {
    boundaries: AGENT_LEARNING_BOUNDARY_MODULES,
    hotPaths: AGENT_LEARNING_HOT_PATH_TOUCHPOINTS,
    verifyCommands: AGENT_LEARNING_VERIFY_COMMANDS,
    featureFlag: 'CRAFT_FEATURE_AGENT_LEARNING=1|0 or workspace.agentLearning.enabled',
  };
}
