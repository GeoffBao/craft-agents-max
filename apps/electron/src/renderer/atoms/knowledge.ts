import { atom } from 'jotai'
import type { RagChunk, VaultDocument } from '@craft-agent/knowledge-base'
import type { KnowledgeEngineConfig, KnowledgeInitProgress } from '../../shared/types'

export interface KBStatus {
  status: string
  documentCount: number
  error: string | null
  progress: KnowledgeInitProgress | null
}

export const kbStatusAtom = atom<KBStatus>({
  status: 'uninitialized',
  documentCount: 0,
  error: null,
  progress: null,
})
export const kbConfigAtom = atom<KnowledgeEngineConfig | null>(null)
export const kbSearchQueryAtom = atom<string>('')
export const kbSearchResultsAtom = atom<RagChunk[]>([])
export const kbSearchLoadingAtom = atom<boolean>(false)
export const kbSelectedArticleAtom = atom<(VaultDocument & { backlinks: string[] }) | null>(null)
export const kbJourneyDocsAtom = atom<VaultDocument[]>([])
// All indexed documents (loaded once engine is ready)
export const kbAllDocsAtom = atom<VaultDocument[]>([])
// Recently viewed article paths (most recent first, max 8)
export const kbRecentPathsAtom = atom<string[]>([])
// Vault root path (loaded once from config)
export const kbVaultRootAtom = atom<string>('')
