import type { SessionToolContext } from '../context.ts';
import type { ToolResult } from '../types.ts';
import { successResponse, errorResponse } from '../response.ts';

export interface MemorySearchArgs {
  query: string;
  limit?: number;
}

export async function handleMemorySearch(
  ctx: SessionToolContext,
  args: MemorySearchArgs,
): Promise<ToolResult> {
  if (!ctx.searchMemoryMd) {
    return errorResponse('memory_search is not available in this environment.');
  }

  try {
    const result = await ctx.searchMemoryMd({
      query: args.query,
      limit: args.limit,
    });
    return successResponse(JSON.stringify(result, null, 2));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse(`memory_search failed: ${message}`);
  }
}
