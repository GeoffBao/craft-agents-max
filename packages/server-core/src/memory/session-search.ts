/**
 * Session search over FTS5 index.
 */

import type { SessionSearchResult } from '@craft-agent/session-tools-core';
import { getSessionIndexManager } from './session-indexer.ts';

export interface SessionSearchOptions {
  query: string;
  limit?: number;
  sessionId?: string;
  cursor?: string;
  workspacePath: string;
}

export function searchSessions(options: SessionSearchOptions): SessionSearchResult {
  const mgr = getSessionIndexManager(options.workspacePath);
  return mgr.search({
    query: options.query,
    limit: options.limit,
    sessionId: options.sessionId,
    cursor: options.cursor,
  });
}
