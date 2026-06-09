import type { SessionToolContext } from '../context.ts';
import type { ToolResult } from '../types.ts';
import { successResponse, errorResponse } from '../response.ts';

export interface SessionSearchArgs {
  query: string;
  limit?: number;
  sessionId?: string;
  cursor?: string;
}

export interface SessionSearchHit {
  sessionId: string;
  sessionName?: string;
  messageId: string;
  role: string;
  snippet: string;
  contextBefore?: string;
  contextAfter?: string;
  timestamp?: number;
}

export interface SessionSearchResult {
  hits: SessionSearchHit[];
  nextCursor?: string;
  totalApprox?: number;
}

export async function handleSessionSearch(
  ctx: SessionToolContext,
  args: SessionSearchArgs,
): Promise<ToolResult> {
  if (!ctx.sessionSearch) {
    return errorResponse('session_search is not available in this environment.');
  }

  if (!args.query?.trim()) {
    return errorResponse('query is required.');
  }

  try {
    const result = await ctx.sessionSearch({
      query: args.query.trim(),
      limit: args.limit,
      sessionId: args.sessionId,
      cursor: args.cursor,
      workspacePath: ctx.workspacePath,
    });
    return successResponse(JSON.stringify(result, null, 2));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse(`Session search failed: ${message}`);
  }
}
