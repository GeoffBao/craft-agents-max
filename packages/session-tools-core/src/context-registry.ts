/**
 * Plugin Lifecycle Registries
 *
 * Lightweight registries that let @craft-agent/knowledge-base hook into the
 * agent lifecycle without creating dependency cycles:
 *
 *   knowledge-base  → session-tools-core  (register)
 *   shared          → session-tools-core  (consume context providers)
 *   server-core     → session-tools-core  (consume turn-complete handlers)
 */

// ============================================================
// Knowledge Context Provider Registry
// ============================================================

export type KnowledgeContextProvider = (query: string) => Promise<string | null>;

const _contextProviders: KnowledgeContextProvider[] = [];

/** Register a RAG context provider. Called once at app startup. */
export function registerContextProvider(fn: KnowledgeContextProvider): void {
  _contextProviders.push(fn);
}

/** Returns all registered context providers. Called by prompt-builder before each turn. */
export function getContextProviders(): readonly KnowledgeContextProvider[] {
  return _contextProviders;
}

// ============================================================
// Turn Complete Handler Registry
// ============================================================

export interface TurnCompletePayload {
  sessionId: string;
  workspaceRootPath: string;
}

export type TurnCompleteHandler = (payload: TurnCompletePayload) => Promise<void>;

const _turnCompleteHandlers: TurnCompleteHandler[] = [];

/** Register a handler called after every successful agent turn. Called once at app startup. */
export function registerTurnCompleteHandler(fn: TurnCompleteHandler): void {
  _turnCompleteHandlers.push(fn);
}

/** Returns all registered turn-complete handlers. Called by SessionManager after turn end. */
export function getTurnCompleteHandlers(): readonly TurnCompleteHandler[] {
  return _turnCompleteHandlers;
}
