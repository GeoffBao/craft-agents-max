import type { SessionToolContext } from '../context.ts';
import type { ToolResult } from '../types.ts';
import { successResponse, errorResponse } from '../response.ts';

export type MemoryAction = 'add' | 'replace' | 'remove';
export type MemoryTarget = 'user' | 'memory' | 'project';

export interface MemoryArgs {
  action: MemoryAction;
  target: MemoryTarget;
  content: string;
  key?: string;
}

export interface MemoryOperationResult {
  ok: boolean;
  message: string;
}

export async function handleMemory(
  ctx: SessionToolContext,
  args: MemoryArgs,
): Promise<ToolResult> {
  if (!ctx.applyMemoryOperation) {
    return errorResponse('memory tool is not available in this environment.');
  }

  try {
    const result = await ctx.applyMemoryOperation({
      action: args.action,
      target: args.target,
      content: args.content,
      key: args.key,
    });
    if (!result.ok) {
      return errorResponse(result.message);
    }
    return successResponse(result.message);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse(`Memory operation failed: ${message}`);
  }
}
