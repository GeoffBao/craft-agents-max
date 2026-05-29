import { existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { mainLog } from './logger'

export const DEFAULT_KB_VAULT_PATH = join(homedir(), 'Workspace/Resources/obsidian/AI-KN-Base')
export const DEFAULT_KB_CACHE_PATH = join(homedir(), '.craft-agent/knowledge-base')

export function getKnowledgeVaultPath(): string {
  return process.env.CRAFT_KB_VAULT_PATH?.trim() || DEFAULT_KB_VAULT_PATH
}

export function getKnowledgeCachePath(): string {
  return process.env.CRAFT_KB_CACHE_PATH?.trim() || DEFAULT_KB_CACHE_PATH
}

let initPromise: Promise<void> | null = null

/** Initialize KB engine in background after RPC server is up. */
export function initKnowledgeBaseEngine(): Promise<void> {
  if (initPromise) return initPromise

  initPromise = (async () => {
    const cachePath = getKnowledgeCachePath()
    const vaultPath = getKnowledgeVaultPath()

    if (!existsSync(vaultPath)) {
      mainLog.warn(`[knowledge] Vault not found at ${vaultPath} — engine will stay uninitialized`)
      return
    }

    try {
      const { initKnowledgeBase, resolveKBConfig } = await import('@craft-agent/knowledge-base')
      const config = resolveKBConfig({
        vaultPath,
        cachePath,
        enableEmbeddings: process.env.CRAFT_KB_ENABLE_EMBEDDINGS === '1',
      })

      const engine = initKnowledgeBase(config)

      mainLog.info(`[knowledge] Indexing vault: ${config.vaultPath}`)
      await engine.init()
      mainLog.info(`[knowledge] Engine ready — ${engine.getDocumentCount()} documents indexed`)
    } catch (err) {
      mainLog.error('[knowledge] Engine initialization failed:', err)
    }
  })()

  return initPromise
}

export async function disposeKnowledgeBaseEngine(): Promise<void> {
  try {
    const { getKnowledgeBaseEngine } = await import('@craft-agent/knowledge-base')
    getKnowledgeBaseEngine()?.dispose()
    mainLog.info('[knowledge] Engine disposed')
  } catch (err) {
    mainLog.error('[knowledge] Engine dispose failed:', err)
  }
  initPromise = null
}
