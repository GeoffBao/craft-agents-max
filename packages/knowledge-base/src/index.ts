// Core exports
export type { KBConfig, VaultDocument, VaultSection, SearchResult, RagResult, RagChunk, EmbeddingFn } from './types.ts';
export { DEFAULT_KB_CONFIG } from './types.ts';
export { loadVault, parseMarkdownFile, getExcerpt } from './vault-loader.ts';
export { SearchEngine } from './search-engine.ts';
export { VaultWatcher } from './watcher.ts';
export { retrieveContext, searchWiki } from './rag.ts';
export {
  KnowledgeBaseEngine,
  getKnowledgeBaseEngine,
  initKnowledgeBase,
} from './engine.ts';
export type { EngineStatus } from './engine.ts';
export type { KBInitProgress, KBInitPhase } from './progress.ts';
export {
  loadStoredConfig,
  saveStoredConfig,
  resolveKBConfig,
  getDefaultCachePath,
} from './config-store.ts';
export type { StoredKBConfig } from './config-store.ts';

// Plugin registration (side effects) — import this module to register KB tools + context provider + write-back
import { registerKnowledgeTools } from './tools.ts';
import { registerKnowledgeContextProvider } from './context-provider.ts';
import { registerWriteBackHandler } from './write-back.ts';

registerKnowledgeTools();
registerKnowledgeContextProvider();
registerWriteBackHandler();
