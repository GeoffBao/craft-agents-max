/**
 * Knowledge Base native tools — registered into craft-agents core at startup.
 * Handlers call getKnowledgeBaseEngine() directly (no cycle: kb → session-tools-core only).
 */
import { z } from 'zod';
import { registerExternalTools } from '@craft-agent/session-tools-core';
import type { SessionToolContext, SessionToolHandler } from '@craft-agent/session-tools-core';
import type { ToolResult } from '@craft-agent/session-tools-core';
import { getKnowledgeBaseEngine } from './engine.ts';

// ============================================================
// Schemas
// ============================================================

const SearchWikiSchema = z.object({
  query: z.string().describe('Search query (English or Chinese)'),
  limit: z.number().int().min(1).max(20).optional().describe('Max results (default 5)'),
});

const ReadWikiArticleSchema = z.object({
  path: z.string().describe('Relative path of the article (e.g. "Wiki/concepts/transformer.md")'),
});

const AskKnowledgeBaseSchema = z.object({
  question: z.string().describe('Natural language question to answer from the knowledge base'),
  maxChunks: z.number().int().min(1).max(10).optional().describe('Max context chunks (default 3)'),
});

// ============================================================
// Handlers
// ============================================================

const handleSearchWiki: SessionToolHandler = async (
  _ctx: SessionToolContext,
  args: z.infer<typeof SearchWikiSchema>,
): Promise<ToolResult> => {
  const engine = getKnowledgeBaseEngine();
  if (!engine || engine.getStatus() !== 'ready') {
    return { content: [{ type: 'text', text: 'Knowledge base is not ready. Status: ' + (engine?.getStatus() ?? 'uninitialized') }] };
  }
  const results = await engine.search(args.query, args.limit ?? 5);
  if (results.length === 0) {
    return { content: [{ type: 'text', text: `No results found for: "${args.query}"` }] };
  }
  const text = results
    .map((r, i) => {
      const score = r.matchType === 'semantic'
        ? `semantic ${(r.score * 100).toFixed(0)}%`
        : `fulltext ${r.score.toFixed(1)}`;
      return `[${i + 1}] ${r.relativePath} (${score})\nTitle: ${r.title}\n${r.excerpt}`;
    })
    .join('\n\n');
  return { content: [{ type: 'text', text }] };
};

const handleReadWikiArticle: SessionToolHandler = async (
  _ctx: SessionToolContext,
  args: z.infer<typeof ReadWikiArticleSchema>,
): Promise<ToolResult> => {
  const engine = getKnowledgeBaseEngine();
  if (!engine || engine.getStatus() !== 'ready') {
    return { content: [{ type: 'text', text: 'Knowledge base is not ready.' }] };
  }
  const doc = engine.getArticle(args.path);
  if (!doc) {
    return { content: [{ type: 'text', text: `Article not found: ${args.path}` }] };
  }
  const backlinkIds = engine.getBacklinks(doc.title);
  const backlinksSection = backlinkIds.length > 0
    ? `\n\n---\n**Backlinks (${backlinkIds.length}):** ${backlinkIds.slice(0, 10).join(', ')}${backlinkIds.length > 10 ? ' …' : ''}`
    : '';
  return {
    content: [{
      type: 'text',
      text: `# ${doc.title}\n**Path:** ${doc.relativePath}\n**Tags:** ${doc.tags.join(', ') || 'none'}\n\n${doc.body}${backlinksSection}`,
    }],
  };
};

const handleAskKnowledgeBase: SessionToolHandler = async (
  _ctx: SessionToolContext,
  args: z.infer<typeof AskKnowledgeBaseSchema>,
): Promise<ToolResult> => {
  const engine = getKnowledgeBaseEngine();
  if (!engine || engine.getStatus() !== 'ready') {
    return { content: [{ type: 'text', text: 'Knowledge base is not ready.' }] };
  }
  const rag = await engine.getRagContext(args.question);
  if (rag.chunks.length === 0) {
    return { content: [{ type: 'text', text: `No relevant information found for: "${args.question}"` }] };
  }
  return { content: [{ type: 'text', text: rag.formattedContext }] };
};

// ============================================================
// Registration (called as side effect on import)
// ============================================================

export function registerKnowledgeTools(): void {
  registerExternalTools([
    {
      name: 'search_wiki',
      description: `Search your personal knowledge base (Obsidian vault) using full-text and semantic search.
Returns ranked results with excerpts and file paths.
Use this to find relevant notes, concepts, articles, or research from your Wiki, Notes, and Journey sections.
Supports both English and Chinese queries.`,
      inputSchema: SearchWikiSchema,
      executionMode: 'registry',
      safeMode: 'allow',
      readOnly: true,
      handler: handleSearchWiki,
    },
    {
      name: 'read_wiki_article',
      description: `Read the full content of a specific article from your personal knowledge base.
Provide the relative path (e.g. "Wiki/concepts/transformer.md").
Returns the full markdown content along with backlinks.
Use this after search_wiki to read the complete content of a result.`,
      inputSchema: ReadWikiArticleSchema,
      executionMode: 'registry',
      safeMode: 'allow',
      readOnly: true,
      handler: handleReadWikiArticle,
    },
    {
      name: 'ask_knowledge_base',
      description: `Ask a question and get relevant context retrieved from your personal knowledge base.
Uses three-layer retrieval (semantic + keyword) and returns a formatted knowledge block.
Best for open-ended questions where you want the most relevant notes synthesized.`,
      inputSchema: AskKnowledgeBaseSchema,
      executionMode: 'registry',
      safeMode: 'allow',
      readOnly: true,
      handler: handleAskKnowledgeBase,
    },
  ]);
}
