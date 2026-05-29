import MiniSearch from 'minisearch';
import type { VaultDocument, SearchResult, EmbeddingFn } from './types.ts';
import { getExcerpt } from './vault-loader.ts';

interface IndexDoc {
  id: string
  title: string
  tags: string
  body: string
  section: string
}

// Matches WIPA's tokenizer: insert spaces around CJK codepoints then split
function cjkTokenize(text: string): string[] {
  return text
    .replace(/(\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul})/gu, ' $1 ')
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

export interface SearchOptions {
  limit?: number
  fuzzy?: number | boolean
  prefix?: boolean
  boost?: { title?: number; tags?: number; body?: number }
  filter?: (doc: VaultDocument) => boolean
}

export class SearchEngine {
  private miniSearch: MiniSearch<IndexDoc>
  private documents = new Map<string, VaultDocument>()
  private embeddings = new Map<string, Float32Array>()
  private embeddingFn: EmbeddingFn | null = null

  constructor() {
    this.miniSearch = new MiniSearch<IndexDoc>({
      fields: ['title', 'tags', 'body'],
      storeFields: ['id'],
      tokenize: cjkTokenize,
      processTerm: (term) => term.toLowerCase(),
      searchOptions: {
        boost: { title: 3, tags: 2, body: 1 },
        fuzzy: 0.2,
        prefix: true,
        combineWith: 'OR',
      },
    });
  }

  setEmbeddingFn(fn: EmbeddingFn): void {
    this.embeddingFn = fn;
  }

  get documentCount(): number {
    return this.documents.size;
  }

  buildIndex(docs: VaultDocument[]): void {
    const batch: IndexDoc[] = docs.map((d) => ({
      id: d.id,
      title: d.title,
      tags: d.tags.join(' '),
      body: d.bodyText.slice(0, 5000),
      section: d.section,
    }));
    this.miniSearch.addAll(batch);
    for (const d of docs) {
      this.documents.set(d.id, d);
    }
  }

  addDocument(doc: VaultDocument): void {
    if (this.documents.has(doc.id)) {
      try { this.miniSearch.remove({ id: doc.id } as IndexDoc); } catch { /* ignore */ }
      this.embeddings.delete(doc.id);
    }
    this.miniSearch.add({
      id: doc.id,
      title: doc.title,
      tags: doc.tags.join(' '),
      body: doc.bodyText.slice(0, 5000),
      section: doc.section,
    });
    this.documents.set(doc.id, doc);
  }

  removeDocument(id: string): void {
    if (this.documents.has(id)) {
      try { this.miniSearch.remove({ id } as IndexDoc); } catch { /* ignore */ }
      this.documents.delete(id);
      this.embeddings.delete(id);
    }
  }

  search(query: string, options: SearchOptions = {}): SearchResult[] {
    if (!query.trim()) return [];
    const { limit = 10, filter } = options;

    const raw = this.miniSearch.search(query);

    const results: SearchResult[] = [];
    for (const hit of raw) {
      const doc = this.documents.get(hit.id);
      if (!doc) continue;
      if (filter && !filter(doc)) continue;
      results.push({
        document: doc,
        score: hit.score,
        matchType: 'fulltext',
        excerpt: getExcerpt(doc.bodyText, query),
      });
      if (results.length >= limit) break;
    }
    return results;
  }

  async semanticSearch(
    query: string,
    topK = 5,
    filter?: (doc: VaultDocument) => boolean,
  ): Promise<SearchResult[]> {
    if (!this.embeddingFn || this.embeddings.size === 0) return [];

    const [queryVec] = await this.embeddingFn([query]);
    if (!queryVec) return [];

    const scored: { id: string; score: number }[] = [];
    for (const [id, vec] of this.embeddings) {
      const doc = this.documents.get(id);
      if (!doc) continue;
      if (filter && !filter(doc)) continue;
      scored.push({ id, score: cosineSimilarity(queryVec, vec) });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK).map(({ id, score }) => {
      const doc = this.documents.get(id)!;
      return {
        document: doc,
        score,
        matchType: 'semantic' as const,
        excerpt: getExcerpt(doc.bodyText, query),
      };
    });
  }

  async indexEmbeddings(
    ids?: string[],
    onProgress?: (done: number, total: number) => void,
  ): Promise<void> {
    if (!this.embeddingFn) return;
    const targets = ids
      ? (ids.map((id) => this.documents.get(id)).filter(Boolean) as VaultDocument[])
      : [...this.documents.values()];

    const BATCH = 32;
    let done = 0;
    const total = targets.length;
    onProgress?.(0, total);

    for (let i = 0; i < targets.length; i += BATCH) {
      const batch = targets.slice(i, i + BATCH);
      const texts = batch.map((d) => `${d.title} ${d.bodyText.slice(0, 512)}`);
      const vecs = await this.embeddingFn(texts);
      for (let j = 0; j < batch.length; j++) {
        const doc = batch[j];
        const vec = vecs[j];
        if (doc && vec) this.embeddings.set(doc.id, vec);
      }
      done = Math.min(total, i + batch.length);
      onProgress?.(done, total);
    }
  }

  getDocument(id: string): VaultDocument | undefined {
    return this.documents.get(id);
  }

  getAllDocuments(): VaultDocument[] {
    return [...this.documents.values()];
  }
}

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    dot += ai * bi;
    na += ai * ai;
    nb += bi * bi;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
