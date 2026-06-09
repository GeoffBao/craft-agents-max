import type { SessionToolContext } from '../context.ts';
import type { ToolResult } from '../types.ts';
import { successResponse, errorResponse } from '../response.ts';

export interface SkillViewArgs {
  skillSlug: string;
}

export interface SkillViewResult {
  slug: string;
  name: string;
  description: string;
  source: string;
  path: string;
  body: string;
  isDraft?: boolean;
}

export async function handleSkillView(
  ctx: SessionToolContext,
  args: SkillViewArgs,
): Promise<ToolResult> {
  if (!ctx.viewSkill) {
    return errorResponse('skill_view is not available in this environment.');
  }

  if (!args.skillSlug?.trim()) {
    return errorResponse('skillSlug is required.');
  }

  try {
    const result = await ctx.viewSkill(args.skillSlug.trim());
    if (!result) {
      return errorResponse(`Skill not found: ${args.skillSlug}`);
    }
    return successResponse(JSON.stringify(result, null, 2));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse(`skill_view failed: ${message}`);
  }
}
