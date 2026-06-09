export { SessionIndexManager, getSessionIndexManager } from './session-indexer.ts';
export { MemoryIndexManager, getMemoryIndexManager } from './memory-indexer.ts';
export { searchSessions, type SessionSearchOptions } from './session-search.ts';
export { searchMemoryFiles } from './memory-search.ts';
export { logAgentLearningEvent, type ObservabilityEvent, type ObservabilityEventType } from './observability.ts';
export {
  indexSessionForRecall,
  emitSessionEndLearningSignals,
  evaluatePreCompactLearningInfoMessage,
  evaluateSessionEndLearningInfoMessage,
  createMemorySearchFn,
  createSessionSearchFn,
} from './agent-learning-hooks.ts';
export { runSilentCompactionFlushInWorker } from './silent-compaction-flush-worker.ts';
