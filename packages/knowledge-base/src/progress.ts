export type KBInitPhase =
  | 'idle'
  | 'loading_vault'
  | 'building_index'
  | 'downloading_model'
  | 'indexing_embeddings'
  | 'ready'
  | 'error'

export interface KBInitProgress {
  phase: KBInitPhase
  message: string
  /** 0–100 overall progress */
  percent: number
  embeddingDone: number
  embeddingTotal: number
}

export const IDLE_PROGRESS: KBInitProgress = {
  phase: 'idle',
  message: '',
  percent: 0,
  embeddingDone: 0,
  embeddingTotal: 0,
};
