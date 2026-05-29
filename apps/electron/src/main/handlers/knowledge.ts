import { RPC_CHANNELS } from '@craft-agent/shared/protocol'
import type { RpcServer } from '@craft-agent/server-core/transport'
import type { HandlerDeps } from './handler-deps'
import { listBooks, listVaultDiagramFiles, readVaultFile } from './knowledge-vault-io'

export function registerKnowledgeHandlers(server: RpcServer, _deps: HandlerDeps): void {
  // Dynamic import — knowledge-base package is optional / may not be initialized yet
  async function getEngine() {
    try {
      const { getKnowledgeBaseEngine } = await import('@craft-agent/knowledge-base')
      const engine = getKnowledgeBaseEngine()
      if (!engine || engine.getStatus() !== 'ready') return null
      return engine
    } catch {
      return null
    }
  }

  server.handle(RPC_CHANNELS.knowledge.GET_STATUS, async () => {
    try {
      const { getKnowledgeBaseEngine } = await import('@craft-agent/knowledge-base')
      const engine = getKnowledgeBaseEngine()
      const progress = engine?.getProgress()
      return {
        status: engine?.getStatus() ?? 'uninitialized',
        documentCount: engine?.getDocumentCount() ?? 0,
        error: engine?.getError() ?? null,
        progress: progress
          ? {
              phase: progress.phase,
              message: progress.message,
              percent: progress.percent,
              embeddingDone: progress.embeddingDone,
              embeddingTotal: progress.embeddingTotal,
            }
          : null,
      }
    } catch {
      return { status: 'uninitialized', documentCount: 0, error: null, progress: null }
    }
  })

  server.handle(RPC_CHANNELS.knowledge.GET_CONFIG, async () => {
    try {
      const { getKnowledgeBaseEngine } = await import('@craft-agent/knowledge-base')
      const engine = getKnowledgeBaseEngine()
      if (!engine) return null
      const cfg = engine.getConfig()
      return {
        vaultPath: cfg.vaultPath,
        cachePath: cfg.cachePath,
        autoInject: cfg.autoInject,
        injectThreshold: cfg.injectThreshold,
        injectMaxChunks: cfg.injectMaxChunks,
        writeBackMode: cfg.writeBackMode,
        embeddingModel: cfg.embeddingModel,
        indexedSections: cfg.indexedSections,
        enableEmbeddings: cfg.enableEmbeddings,
      }
    } catch {
      return null
    }
  })

  server.handle(RPC_CHANNELS.knowledge.UPDATE_CONFIG, async (_ctx, patch: Record<string, unknown>) => {
    try {
      const { getKnowledgeBaseEngine } = await import('@craft-agent/knowledge-base')
      const engine = getKnowledgeBaseEngine()
      if (!engine) return { ok: false as const, error: 'Engine not initialized' }

      const prev = engine.getConfig()
      engine.updateConfig(patch as Parameters<typeof engine.updateConfig>[0])

      const next = engine.getConfig()
      if (!prev.enableEmbeddings && next.enableEmbeddings) {
        void engine.startEmbeddingIndex()
      }

      return { ok: true as const }
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
    }
  })

  server.handle(RPC_CHANNELS.knowledge.REINDEX, async () => {
    try {
      const { getKnowledgeBaseEngine } = await import('@craft-agent/knowledge-base')
      const engine = getKnowledgeBaseEngine()
      if (!engine) return { ok: false as const, error: 'Engine not initialized' }
      await engine.reindex()
      return { ok: true as const, documentCount: engine.getDocumentCount() }
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
    }
  })

  server.handle(RPC_CHANNELS.knowledge.SEARCH, async (_ctx, query: string, limit = 10) => {
    const engine = await getEngine()
    if (!engine) return []
    return engine.search(query, limit)
  })

  server.handle(RPC_CHANNELS.knowledge.GET_ARTICLE, async (_ctx, relativePath: string) => {
    const engine = await getEngine()
    if (!engine) return null
    const doc = engine.getArticle(relativePath)
    if (!doc) return null
    return {
      ...doc,
      backlinks: engine.getBacklinks(doc.title),
    }
  })

  server.handle(RPC_CHANNELS.knowledge.GET_BACKLINKS, async (_ctx, title: string) => {
    const engine = await getEngine()
    if (!engine) return []
    return engine.getBacklinks(title)
  })

  server.handle(RPC_CHANNELS.knowledge.LIST_DOCS, async (_ctx, section?: string) => {
    const engine = await getEngine()
    if (!engine) return []
    const all = engine.getAllDocuments()
    if (section) return all.filter(d => d.section === section)
    return all
  })

  server.handle(RPC_CHANNELS.knowledge.LIST_BOOKS, async () => {
    try {
      return listBooks()
    } catch {
      return []
    }
  })

  server.handle(RPC_CHANNELS.knowledge.LIST_VAULT_FILES, async () => {
    try {
      return listVaultDiagramFiles()
    } catch {
      return []
    }
  })

  server.handle(RPC_CHANNELS.knowledge.READ_VAULT_FILE, async (_ctx, relativePath: string) => {
    try {
      return readVaultFile(relativePath)
    } catch {
      return null
    }
  })
}
