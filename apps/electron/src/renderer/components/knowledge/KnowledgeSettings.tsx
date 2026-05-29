import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { useAtom } from 'jotai'
import { kbConfigAtom, kbStatusAtom, type KBStatus } from '@/atoms/knowledge'
import type { KnowledgeEngineConfig } from '../../../shared/types'

export function KnowledgeSettings() {
  const { t } = useTranslation()
  const [kbStatus, setKbStatus] = useAtom(kbStatusAtom)
  const [config, setConfig] = useAtom(kbConfigAtom)
  const [saving, setSaving] = React.useState(false)
  const [reindexing, setReindexing] = React.useState(false)

  const refresh = React.useCallback(async () => {
    const [status, cfg] = await Promise.all([
      window.electronAPI.knowledgeGetStatus(),
      window.electronAPI.knowledgeGetConfig(),
    ])
    setKbStatus({
      status: status.status,
      documentCount: status.documentCount,
      error: status.error,
      progress: status.progress,
    })
    setConfig(cfg)
  }, [setKbStatus, setConfig])

  React.useEffect(() => {
    void refresh()
    const id = setInterval(() => void refresh(), kbStatus.status === 'ready' ? 5_000 : 1_500)
    return () => clearInterval(id)
  }, [refresh, kbStatus.status])

  const update = async (patch: Partial<KnowledgeEngineConfig>) => {
    setSaving(true)
    try {
      const res = await window.electronAPI.knowledgeUpdateConfig(patch)
      if (!res.ok) {
        console.error('[knowledge] config update failed:', res.error)
      }
      await refresh()
    } finally {
      setSaving(false)
    }
  }

  const handleReindex = async () => {
    setReindexing(true)
    try {
      await window.electronAPI.knowledgeReindex()
      await refresh()
    } finally {
      setReindexing(false)
    }
  }

  const progress = kbStatus.progress
  const showEmbeddingBar =
    progress &&
    (progress.phase === 'downloading_model' || progress.phase === 'indexing_embeddings')

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-4 py-3 border-b border-border/50 flex-shrink-0">
        <h2 className="text-sm font-semibold">{t('knowledge.settings')}</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          {t('knowledge.documentsIndexed', { count: kbStatus.documentCount })}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 px-4 py-4 space-y-6">
        {/* Index status */}
        <section className="space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {t('knowledge.indexProgress')}
          </h3>
          <StatusBadge status={kbStatus} />
          {progress?.message && (
            <p className="text-xs text-muted-foreground">{progress.message}</p>
          )}
          {progress && progress.percent > 0 && progress.percent < 100 && (
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
          )}
          {showEmbeddingBar && progress.embeddingTotal > 0 && (
            <p className="text-xs text-muted-foreground">
              {t('knowledge.embeddingProgress', {
                done: progress.embeddingDone,
                total: progress.embeddingTotal,
              })}
            </p>
          )}
          {kbStatus.error && (
            <p className="text-xs text-destructive">{kbStatus.error}</p>
          )}
          <button
            type="button"
            onClick={() => void handleReindex()}
            disabled={reindexing || kbStatus.status === 'loading'}
            className="text-xs px-3 py-1.5 rounded-md border border-border/60 hover:bg-accent/50 disabled:opacity-50"
          >
            {reindexing ? t('knowledge.reindexing') : t('knowledge.reindex')}
          </button>
        </section>

        {/* Vault path */}
        {config && (
          <section className="space-y-1">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {t('knowledge.vaultPath')}
            </h3>
            <p className="text-xs font-mono text-muted-foreground break-all">{config.vaultPath}</p>
          </section>
        )}

        {/* Toggles */}
        {config && (
          <section className="space-y-4">
            <ToggleRow
              label={t('knowledge.autoInject')}
              description={t('knowledge.autoInjectDescription')}
              checked={config.autoInject}
              disabled={saving}
              onChange={v => void update({ autoInject: v })}
            />
            <ToggleRow
              label={t('knowledge.enableEmbeddings')}
              description={t('knowledge.enableEmbeddingsDescription')}
              checked={config.enableEmbeddings}
              disabled={saving}
              onChange={v => void update({ enableEmbeddings: v })}
            />
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t('knowledge.writeBackMode')}</label>
              <p className="text-xs text-muted-foreground">{t('knowledge.writeBackDescription')}</p>
              <select
                value={config.writeBackMode}
                disabled={saving}
                onChange={e => void update({
                  writeBackMode: e.target.value as KnowledgeEngineConfig['writeBackMode'],
                })}
                className="w-full text-sm bg-muted/50 border border-border/40 rounded-md px-2 py-1.5"
              >
                <option value="on_session_end">{t('knowledge.writeBackOnSessionEnd')}</option>
                <option value="on_every_turn">{t('knowledge.writeBackOnEveryTurn')}</option>
                <option value="disabled">{t('knowledge.writeBackDisabled')}</option>
              </select>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: KBStatus }) {
  const { t } = useTranslation()
  const label =
    status.status === 'ready'
      ? t('knowledge.statusReady')
      : status.status === 'loading'
        ? t('knowledge.statusLoading')
        : status.status === 'error'
          ? t('knowledge.statusError')
          : t('knowledge.engineNotReady')

  const color =
    status.status === 'ready'
      ? 'text-green-600 dark:text-green-400'
      : status.status === 'error'
        ? 'text-destructive'
        : 'text-muted-foreground'

  return <span className={`text-sm font-medium ${color}`}>{label}</span>
}

function ToggleRow({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  disabled?: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors ${
          checked ? 'bg-primary' : 'bg-muted'
        } ${disabled ? 'opacity-50' : ''}`}
      >
        <span
          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-background shadow transition ${
            checked ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  )
}
