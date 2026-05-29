/**
 * RAG context provider — registered into prompt-builder at startup via session-tools-core.
 * Automatically injects relevant knowledge-base chunks before every agent turn.
 */
import { registerContextProvider } from '@craft-agent/session-tools-core';
import { getKnowledgeBaseEngine } from './engine.ts';

export function registerKnowledgeContextProvider(): void {
  registerContextProvider(async (query: string): Promise<string | null> => {
    const engine = getKnowledgeBaseEngine();
    if (!engine || engine.getStatus() !== 'ready') return null;
    if (!engine.getConfig().autoInject) return null;

    const rag = await engine.getRagContext(query);
    return rag.formattedContext || null;
  });
}
