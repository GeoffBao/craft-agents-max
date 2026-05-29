import path from 'path';
import fs from 'fs';
import { loadVault, parseMarkdownFile } from './vault-loader.ts';
import { SearchEngine } from './search-engine.ts';
import { VaultWatcher } from './watcher.ts';
import { retrieveContext, searchWiki } from './rag.ts';
import { saveStoredConfig } from './config-store.ts';
import type { KBConfig, RagResult, RagChunk, VaultDocument, EmbeddingFn } from './types.ts';
import { DEFAULT_KB_CONFIG } from './types.ts';
import type { KBInitProgress } from './progress.ts';
import { IDLE_PROGRESS } from './progress.ts';

export type EngineStatus = 'uninitialized' | 'loading' | 'ready' | 'error'

export class KnowledgeBaseEngine {
  private config: KBConfig
  private searchEngine: SearchEngine
  private watcher: VaultWatcher
  private status: EngineStatus = 'uninitialized'
  private backlinkMap: Record<string, string[]> = {}
  private initError: string | null = null
  private progress: KBInitProgress = { ...IDLE_PROGRESS }
  private embeddingTask: Promise<void> | null = null

  constructor(config: KBConfig) {
    this.config = { ...DEFAULT_KB_CONFIG, ...config };
    this.searchEngine = new SearchEngine();
    this.watcher = new VaultWatcher();
  }

  getStatus(): EngineStatus { return this.status; }
  getError(): string | null { return this.initError; }
  getDocumentCount(): number { return this.searchEngine.documentCount; }
  getConfig(): Readonly<KBConfig> { return this.config; }
  getProgress(): Readonly<KBInitProgress> { return this.progress; }

  private setProgress(patch: Partial<KBInitProgress>): void {
    this.progress = { ...this.progress, ...patch };
  }

  async init(): Promise<void> {
    if (this.status === 'ready') return;
    this.status = 'loading';
    this.initError = null;
    this.setProgress({ phase: 'loading_vault', message: 'Loading vault…', percent: 5 });

    try {
      if (!fs.existsSync(this.config.vaultPath)) {
        throw new Error(`Vault path does not exist: ${this.config.vaultPath}`);
      }

      fs.mkdirSync(this.config.cachePath, { recursive: true });

      const sections = this.config.indexedSections as string[];
      const { documents, backlinkMap } = loadVault(this.config.vaultPath, { sections });

      this.setProgress({ phase: 'building_index', message: 'Building search index…', percent: 40 });
      this.backlinkMap = backlinkMap;
      this.searchEngine.buildIndex(documents);

      this.watcher.start(this.config.vaultPath, sections, {
        onAdd: (p) => this.handleFileChange(p),
        onChange: (p) => this.handleFileChange(p),
        onUnlink: (p) => {
          const rel = path.relative(this.config.vaultPath, p).replace(/\\/g, '/');
          this.searchEngine.removeDocument(rel);
        },
      });

      // Full-text search is available immediately; embeddings run in background.
      this.status = 'ready';
      this.setProgress({
        phase: 'ready',
        message: 'Search index ready',
        percent: 100,
      });

      if (this.config.enableEmbeddings) {
        void this.runEmbeddingIndex(documents);
      }
    } catch (err) {
      this.status = 'error';
      this.initError = err instanceof Error ? err.message : String(err);
      this.setProgress({
        phase: 'error',
        message: this.initError,
        percent: 0,
      });
      throw err;
    }
  }

  private async runEmbeddingIndex(documents: VaultDocument[]): Promise<void> {
    if (this.embeddingTask) return this.embeddingTask;

    this.embeddingTask = (async () => {
      const wikiIds = documents.filter((d) => d.section === 'Wiki').map((d) => d.id);
      if (wikiIds.length === 0) return;

      this.setProgress({
        phase: 'downloading_model',
        message: 'Downloading embedding model…',
        percent: 55,
        embeddingDone: 0,
        embeddingTotal: wikiIds.length,
      });

      const embeddingFn = await tryLoadEmbeddings(
        this.config.embeddingModel,
        (msg, percent) => {
          this.setProgress({
            phase: 'downloading_model',
            message: msg,
            percent: Math.min(70, 55 + Math.round(percent * 0.15)),
          });
        },
      );

      if (!embeddingFn) {
        this.setProgress({
          phase: 'ready',
          message: 'Semantic search unavailable (model load failed)',
          percent: 100,
        });
        return;
      }

      this.searchEngine.setEmbeddingFn(embeddingFn);
      this.setProgress({
        phase: 'indexing_embeddings',
        message: 'Indexing embeddings…',
        percent: 72,
        embeddingDone: 0,
        embeddingTotal: wikiIds.length,
      });

      await this.searchEngine.indexEmbeddings(wikiIds, (done, total) => {
        const ratio = total > 0 ? done / total : 1;
        this.setProgress({
          phase: 'indexing_embeddings',
          message: `Indexing embeddings (${done}/${total})…`,
          percent: 72 + Math.round(ratio * 28),
          embeddingDone: done,
          embeddingTotal: total,
        });
      });

      this.setProgress({
        phase: 'ready',
        message: 'Semantic search ready',
        percent: 100,
        embeddingDone: wikiIds.length,
        embeddingTotal: wikiIds.length,
      });
    })().finally(() => {
      this.embeddingTask = null;
    });

    return this.embeddingTask;
  }

  updateConfig(patch: Partial<KBConfig>): void {
    this.config = { ...this.config, ...patch };
    saveStoredConfig(this.config.cachePath, {
      autoInject: this.config.autoInject,
      injectThreshold: this.config.injectThreshold,
      injectMaxChunks: this.config.injectMaxChunks,
      writeBackMode: this.config.writeBackMode,
      embeddingModel: this.config.embeddingModel,
      indexedSections: this.config.indexedSections,
      enableEmbeddings: this.config.enableEmbeddings,
      vaultPath: this.config.vaultPath,
    });
  }

  async reindex(): Promise<void> {
    this.watcher.stop();
    this.embeddingTask = null;
    this.status = 'uninitialized';
    this.progress = { ...IDLE_PROGRESS };
    await this.init();
  }

  /** Start or resume embedding index without rebuilding full-text index. */
  async startEmbeddingIndex(): Promise<void> {
    if (this.status !== 'ready' || !this.config.enableEmbeddings) return;
    await this.runEmbeddingIndex(this.searchEngine.getAllDocuments());
  }

  private handleFileChange(filePath: string): void {
    const doc = parseMarkdownFile(filePath, this.config.vaultPath);
    if (doc) {
      this.searchEngine.addDocument(doc);
    }
  }

  async search(query: string, limit = 10): Promise<RagChunk[]> {
    this.assertReady();
    return searchWiki(query, this.searchEngine, { limit });
  }

  async getRagContext(query: string): Promise<RagResult> {
    this.assertReady();
    if (!this.config.autoInject) {
      return { chunks: [], formattedContext: '' };
    }
    return retrieveContext(query, this.searchEngine, {
      maxChunks: this.config.injectMaxChunks,
      threshold: this.config.injectThreshold,
    });
  }

  getArticle(relativePath: string): VaultDocument | undefined {
    this.assertReady();
    return this.searchEngine.getDocument(relativePath);
  }

  getBacklinks(title: string): string[] {
    return this.backlinkMap[title.toLowerCase()] ?? [];
  }

  getAllDocuments(): VaultDocument[] {
    return this.searchEngine.getAllDocuments();
  }

  dispose(): void {
    this.watcher.stop();
    this.status = 'uninitialized';
    this.progress = { ...IDLE_PROGRESS };
    this.embeddingTask = null;
  }

  private assertReady(): void {
    if (this.status !== 'ready') {
      throw new Error(`KnowledgeBaseEngine is not ready (status: ${this.status})`);
    }
  }
}

let _instance: KnowledgeBaseEngine | null = null;

export function getKnowledgeBaseEngine(): KnowledgeBaseEngine | null {
  return _instance;
}

export function initKnowledgeBase(config: KBConfig): KnowledgeBaseEngine {
  if (_instance) _instance.dispose();
  _instance = new KnowledgeBaseEngine(config);
  return _instance;
}

type ProgressCallback = (message: string, fraction: number) => void;

async function tryLoadEmbeddings(
  model: string,
  onProgress?: ProgressCallback,
): Promise<EmbeddingFn | null> {
  try {
    const { pipeline } = await import('@xenova/transformers') as {
      pipeline: (
        task: string,
        model: string,
        options?: {
          quantized?: boolean
          progress_callback?: (state: {
            status: string
            file?: string
            progress?: number
            total?: number
          }) => void
        },
      ) => Promise<(text: string, options: Record<string, unknown>) => Promise<{ data: ArrayLike<number> }>>
    };

    onProgress?.('Loading transformers runtime…', 0.1);

    const extractor = await pipeline('feature-extraction', model, {
      quantized: true,
      progress_callback: (state) => {
        if (state.status === 'progress' && state.progress != null && state.total) {
          const fraction = state.progress / state.total;
          const file = state.file ? path.basename(state.file) : 'model files';
          onProgress?.(`Downloading ${file}…`, fraction);
        } else if (state.status === 'initiate') {
          onProgress?.('Preparing model…', 0.05);
        } else if (state.status === 'done') {
          onProgress?.('Model ready', 1);
        }
      },
    });

    const fn: EmbeddingFn = async (texts: string[]): Promise<Float32Array[]> => {
      const results: Float32Array[] = [];
      for (const text of texts) {
        const output = await extractor(text, { pooling: 'mean', normalize: true });
        results.push(new Float32Array(output.data as number[]));
      }
      return results;
    };

    return fn;
  } catch {
    return null;
  }
}
