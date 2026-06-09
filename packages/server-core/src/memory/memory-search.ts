/**
 * FTS-backed memory search over MEMORY.md, PROJECT.md, and daily journals.
 */

import type { MemorySearchResult } from '@craft-agent/shared/memory';
import { getMemoryIndexManager } from './memory-indexer.ts';

export function searchMemoryFiles(
  workspaceRootPath: string,
  query: string,
  limit?: number,
): MemorySearchResult {
  return getMemoryIndexManager(workspaceRootPath).search(query, limit);
}
