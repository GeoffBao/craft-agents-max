export type VaultSection = 'Wiki' | 'Notes' | 'Raw' | 'Journey' | 'Projects' | 'Diagrams' | 'Excalidraw' | 'Library' | 'other'

export interface VaultDocument {
  id: string
  title: string
  path: string
  relativePath: string
  section: VaultSection
  tags: string[]
  frontmatter: Record<string, unknown>
  body: string
  bodyText: string
  wikilinks: string[]
  wordCount: number
  updatedAt: number
}

export interface BacklinkMap {
  [targetTitle: string]: string[]
}

export interface SearchResult {
  document: VaultDocument
  score: number
  matchType: 'fulltext' | 'semantic' | 'hybrid'
  excerpt: string
}

export interface RagChunk {
  path: string
  relativePath: string
  title: string
  score: number
  excerpt: string
  matchType: 'semantic' | 'fulltext'
}

export interface RagResult {
  chunks: RagChunk[]
  formattedContext: string
}

export interface KBConfig {
  vaultPath: string
  cachePath: string
  autoInject: boolean
  injectThreshold: number
  injectMaxChunks: number
  writeBackMode: 'on_session_end' | 'on_every_turn' | 'disabled'
  embeddingModel: string
  indexedSections: VaultSection[]
  enableEmbeddings: boolean  // false by default; enable in P1 after WASM verification
}

export const DEFAULT_KB_CONFIG: Omit<KBConfig, 'vaultPath' | 'cachePath'> = {
  autoInject: true,
  injectThreshold: 0.3,
  injectMaxChunks: 3,
  writeBackMode: 'on_session_end',
  embeddingModel: 'Xenova/multilingual-e5-small',
  indexedSections: ['Wiki', 'Notes', 'Journey'],
  enableEmbeddings: false,
}

export type EmbeddingFn = (texts: string[]) => Promise<Float32Array[]>
