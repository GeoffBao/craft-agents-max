import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import matter from 'gray-matter';
import type { SessionToolContext } from '../context.ts';
import type { ToolResult } from '../types.ts';
import { successResponse, errorResponse } from '../response.ts';

export interface ProposeSkillArgs {
  title: string;
  trigger: string;
  reusable_steps: string;
  guardrails?: string;
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'draft-skill';
}

export async function handleProposeSkill(
  ctx: SessionToolContext,
  args: ProposeSkillArgs,
): Promise<ToolResult> {
  if (!args.title?.trim() || !args.trigger?.trim() || !args.reusable_steps?.trim()) {
    return errorResponse('title, trigger, and reusable_steps are required.');
  }

  const slug = slugify(args.title);
  const draftsDir = join(ctx.skillsPath, '.drafts', slug);
  const skillPath = join(draftsDir, 'SKILL.md');

  if (existsSync(skillPath)) {
    return errorResponse(`Draft already exists at ${skillPath}. Choose a different title or ask the user to approve/merge the existing draft.`);
  }

  const body = [
    '## When to use',
    args.trigger.trim(),
    '',
    '## Steps',
    args.reusable_steps.trim(),
  ];

  if (args.guardrails?.trim()) {
    body.push('', '## Guardrails', args.guardrails.trim());
  }

  body.push(
    '',
    '## Approval',
    'This is a **draft** — not loaded as a production skill until the user confirms.',
    `Session: ${ctx.sessionId}`,
  );

  const content = matter.stringify(body.join('\n'), {
    name: args.title.trim(),
    description: args.trigger.trim().slice(0, 200),
    draft: true,
    proposedFromSession: ctx.sessionId,
    createdAt: new Date().toISOString(),
  });

  try {
    mkdirSync(draftsDir, { recursive: true });
    writeFileSync(skillPath, content, 'utf-8');

    if (ctx.onSkillDraftProposed) {
      ctx.onSkillDraftProposed({ slug, path: skillPath, title: args.title.trim() });
    }

    return successResponse(
      `Skill draft written to ${skillPath}. Not active until user approves and moves out of .drafts/.`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse(`Failed to write skill draft: ${message}`);
  }
}
