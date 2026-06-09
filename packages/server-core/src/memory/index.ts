export { SessionIndexManager, getSessionIndexManager } from './session-indexer.ts';
export { searchSessions, type SessionSearchOptions } from './session-search.ts';
export { logAgentLearningEvent, type ObservabilityEvent, type ObservabilityEventType } from './observability.ts';
export {
  indexSessionForRecall,
  emitSessionEndLearningSignals,
  evaluatePreCompactLearningInfoMessage,
  createSessionSearchFn,
} from './agent-learning-hooks.ts';
