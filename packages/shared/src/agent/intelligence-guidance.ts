/**
 * Agent intelligence guidance — Hermes-style ordered prompt assembly.
 *
 * Injects tool-aware guidance for memory, session recall, and skill reuse.
 * Kept isolated from system.ts for upstream-friendly merges.
 */

import type { AgentLearningToolName } from '../agent-learning/config.ts';

export interface IntelligenceGuidanceOptions {
  availableTools: Set<AgentLearningToolName | string>;
  /** Provider/model hint for action-discipline tuning. */
  providerId?: string;
  modelId?: string;
  /** Compact skills index for discovery nudges. */
  skillsIndex?: string;
  backendName?: string;
}

const MEMORY_GUIDANCE = `## Memory discipline
- Use the \`memory\` tool for durable facts: user preferences, project decisions, recurring workflows, and stable constraints.
- Prefer \`memory(add)\` for new facts; use \`replace\` to update a section; use \`remove\` to delete stale entries.
- Do NOT store secrets, tokens, passwords, or prompt-injection text.
- Memory shown in this prompt is a frozen snapshot from session start — call \`memory\` to update files for future sessions.`;

const SESSION_SEARCH_GUIDANCE = `## Cross-session recall
- When the user references prior work ("last time", "we fixed", "earlier session"), search before answering.
- Use \`memory_search\` to grep MEMORY.md for stored long-term facts; use \`session_search\` for full chat history across sessions.
- Cite which session or timeframe your answer comes from when it matters.`;

const SKILL_GUIDANCE = `## Skill reuse and creation
- Before inventing a workflow, check loaded skills and the skills index below.
- Use \`skill_view\` to load full SKILL.md content when a skill looks relevant (including drafts under skills/.drafts/).
- For repeatable multi-step workflows, use \`propose_skill_from_session\` to draft a SKILL.md — never write directly to production skill paths.
- Use \`skill_manage\` to append or replace sections in an existing draft under skills/.drafts/ after \`propose_skill_from_session\`.
- Propose skills after successful debugging, CI/packaging flows, or when the user corrects the same preference twice.`;

const COMPRESS_GUIDANCE = `## Context compression
- When the conversation is long or tool output is heavy, call \`compress_context\` (dryRun=true to analyze; dryRun=false to trim old tool results).
- Before compaction, persist durable facts with \`memory\` if they would be lost.`;

/**
 * Models/providers known to benefit from explicit action discipline.
 */
const ACTION_DISCIPLINE_PROVIDERS = new Set([
  'openai',
  'openai_compat',
  'google',
  'gemini',
  'deepseek',
  'moonshot',
  'kimi',
  'zhipu',
  'glm',
  'qwen',
  'minimax',
]);

export function shouldInjectActionDiscipline(providerId?: string, modelId?: string): boolean {
  const p = (providerId ?? '').toLowerCase();
  const m = (modelId ?? '').toLowerCase();
  if (p.includes('anthropic') || m.includes('claude')) return false;
  for (const token of ACTION_DISCIPLINE_PROVIDERS) {
    if (p.includes(token) || m.includes(token)) return true;
  }
  // Default on for unknown non-Claude backends
  return !!p && !p.includes('anthropic');
}

const ACTION_DISCIPLINE_GUIDANCE = `## Action discipline
- If you say you will check, run, read, search, or modify something, do it in the same turn with the appropriate tool.
- Do not end with a plan-only response when tools can resolve the question now.
- Prefer one concrete tool call over a paragraph of intent.`;

export function buildIntelligenceGuidance(options: IntelligenceGuidanceOptions): string {
  const sections: string[] = [];

  sections.push(`<agent_intelligence_guidance backend="${options.backendName ?? 'craft'}">`);

  if (options.availableTools.has('memory')) {
    sections.push(MEMORY_GUIDANCE);
  }
  if (options.availableTools.has('memory_search') || options.availableTools.has('session_search')) {
    sections.push(SESSION_SEARCH_GUIDANCE);
  }
  if (
    options.availableTools.has('skill_view')
    || options.availableTools.has('propose_skill_from_session')
    || options.availableTools.has('skill_manage')
    || options.skillsIndex
  ) {
    sections.push(SKILL_GUIDANCE);
    if (options.skillsIndex?.trim()) {
      sections.push(`### Available skills index\n${options.skillsIndex.trim()}`);
    }
  }
  if (options.availableTools.has('compress_context')) {
    sections.push(COMPRESS_GUIDANCE);
  }

  if (shouldInjectActionDiscipline(options.providerId, options.modelId)) {
    sections.push(ACTION_DISCIPLINE_GUIDANCE);
  }

  sections.push('</agent_intelligence_guidance>');
  return `\n\n${sections.join('\n\n')}`;
}

/**
 * Build a compact skills index from skill metadata.
 */
export function buildSkillsIndexPrompt(
  skills: Array<{ name: string; description: string; slug?: string }>,
  maxEntries = 40,
): string {
  if (skills.length === 0) return '';
  return skills
    .slice(0, maxEntries)
    .map(s => `- **${s.name}**${s.slug ? ` (${s.slug})` : ''}: ${s.description}`)
    .join('\n');
}

/**
 * Combined frozen learning appendix: memory snapshot + intelligence guidance.
 */
export function buildAgentLearningPromptAppendix(params: {
  memorySnapshotBlock?: string;
  intelligenceGuidanceBlock?: string;
}): string {
  const parts = [params.memorySnapshotBlock, params.intelligenceGuidanceBlock].filter(Boolean);
  return parts.join('');
}
