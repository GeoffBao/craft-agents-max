import type { SearchEngine } from './search-engine.ts';
import type { RagResult, RagChunk, VaultDocument } from './types.ts';
import { getExcerpt } from './vault-loader.ts';

export interface RagOptions {
  maxChunks?: number
  threshold?: number
  sections?: string[]
}

function makeFilter(sections?: string[]): ((doc: VaultDocument) => boolean) | undefined {
  if (!sections || sections.length === 0) return undefined;
  const set = new Set(sections);
  return (doc) => set.has(doc.section);
}

function dedup(chunks: RagChunk[]): RagChunk[] {
  const seen = new Set<string>();
  return chunks.filter((c) => {
    if (seen.has(c.path)) return false;
    seen.add(c.path);
    return true;
  });
}

export async function retrieveContext(
  query: string,
  engine: SearchEngine,
  options: RagOptions = {}
): Promise<RagResult> {
  const { maxChunks = 3, threshold = 0.0, sections } = options;
  const filter = makeFilter(sections);
  const allChunks: RagChunk[] = [];

  // Layer 1: semantic search (if available)
  const semanticResults = await engine.semanticSearch(query, maxChunks * 2, filter);
  for (const r of semanticResults) {
    if (r.score >= threshold) {
      allChunks.push({
        path: r.document.path,
        relativePath: r.document.relativePath,
        title: r.document.title,
        score: r.score,
        excerpt: r.excerpt,
        matchType: 'semantic',
      });
    }
  }

  // Layer 2: full-text search to fill remaining slots
  const needed = maxChunks - dedup(allChunks).length;
  if (needed > 0) {
    const ftResults = engine.search(query, { limit: needed * 2, filter });
    for (const r of ftResults) {
      allChunks.push({
        path: r.document.path,
        relativePath: r.document.relativePath,
        title: r.document.title,
        score: r.score * 0.01,
        excerpt: r.excerpt,
        matchType: 'fulltext',
      });
    }
  }

  const chunks = dedup(allChunks)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxChunks);

  return {
    chunks,
    formattedContext: formatKnowledgeBlock(chunks, query),
  };
}

function formatKnowledgeBlock(chunks: RagChunk[], query: string): string {
  if (chunks.length === 0) return '';

  const items = chunks
    .map((c, i) => {
      const scoreLabel = c.matchType === 'semantic'
        ? `相关度 ${(c.score * 100).toFixed(0)}%`
        : '关键词匹配';
      return `[${i + 1}] ${c.relativePath}（${scoreLabel}）\n${c.excerpt}`;
    })
    .join('\n\n');

  return `<knowledge_base>
<!-- 来自个人知识库，与当前问题相关，供参考 -->
${items}
</knowledge_base>`;
}

export async function searchWiki(
  query: string,
  engine: SearchEngine,
  options: { limit?: number; threshold?: number } = {}
): Promise<RagChunk[]> {
  const { limit = 5, threshold = 0.0 } = options;

  const semantic = await engine.semanticSearch(query, limit);
  const fulltext = engine.search(query, { limit });

  const seen = new Set<string>();
  const results: RagChunk[] = [];

  for (const r of semantic) {
    if (r.score < threshold) continue;
    seen.add(r.document.id);
    results.push({
      path: r.document.path,
      relativePath: r.document.relativePath,
      title: r.document.title,
      score: r.score,
      excerpt: getExcerpt(r.document.bodyText, query),
      matchType: 'semantic',
    });
  }

  for (const r of fulltext) {
    if (seen.has(r.document.id)) continue;
    seen.add(r.document.id);
    results.push({
      path: r.document.path,
      relativePath: r.document.relativePath,
      title: r.document.title,
      score: r.score * 0.01,
      excerpt: getExcerpt(r.document.bodyText, query),
      matchType: 'fulltext',
    });
  }

  return results.slice(0, limit);
}
