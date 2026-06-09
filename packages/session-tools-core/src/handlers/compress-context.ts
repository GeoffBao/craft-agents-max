import type { SessionToolContext } from '../context.ts';
import type { ToolResult } from '../types.ts';
import { successResponse, errorResponse } from '../response.ts';

export interface CompressContextArgs {
  tokenThreshold?: number;
  dryRun?: boolean;
}

export async function handleCompressContext(
  ctx: SessionToolContext,
  args: CompressContextArgs,
): Promise<ToolResult> {
  if (!ctx.analyzeContextCompression) {
    return errorResponse('compress_context is not available in this environment.');
  }

  try {
    const result = await ctx.analyzeContextCompression({
      tokenThreshold: args.tokenThreshold,
      dryRun: args.dryRun ?? true,
    });
    return successResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse(`compress_context failed: ${message}`);
  }
}
