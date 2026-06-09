import type { SessionToolContext } from '../context.ts';
import type { ToolResult } from '../types.ts';
import { successResponse, errorResponse } from '../response.ts';

export type SkillManageAction = 'append' | 'replace_section';

export interface SkillManageArgs {
  skillSlug: string;
  action: SkillManageAction;
  content: string;
  section?: string;
}

export async function handleSkillManage(
  ctx: SessionToolContext,
  args: SkillManageArgs,
): Promise<ToolResult> {
  if (!ctx.manageSkillDraft) {
    return errorResponse('skill_manage is not available in this environment.');
  }

  try {
    const result = await ctx.manageSkillDraft({
      skillSlug: args.skillSlug,
      action: args.action,
      content: args.content,
      section: args.section,
    });
    if (!result.ok) {
      return errorResponse(result.message);
    }
    return successResponse(result.message);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse(`skill_manage failed: ${message}`);
  }
}
