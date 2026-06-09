import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { FilePenLine } from 'lucide-react'
import { toast } from 'sonner'
import type { LoadedSkillDraft } from '@craft-agent/shared/skills'

export interface SkillDraftsPanelProps {
  workspaceId: string
  drafts: LoadedSkillDraft[]
  onDraftsChanged: () => void
}

export function SkillDraftsPanel({
  workspaceId,
  drafts,
  onDraftsChanged,
}: SkillDraftsPanelProps) {
  const { t } = useTranslation()
  const [busySlug, setBusySlug] = React.useState<string | null>(null)

  if (drafts.length === 0) return null

  const handlePromote = async (slug: string) => {
    setBusySlug(slug)
    try {
      await window.electronAPI.promoteSkillDraft(workspaceId, slug)
      toast.success(t('skillDrafts.promoted', { name: slug }))
      onDraftsChanged()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      toast.error(t('skillDrafts.promoteFailed'), { description: message })
    } finally {
      setBusySlug(null)
    }
  }

  const handleReject = async (slug: string) => {
    setBusySlug(slug)
    try {
      await window.electronAPI.rejectSkillDraft(workspaceId, slug)
      toast.success(t('skillDrafts.rejected', { name: slug }))
      onDraftsChanged()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      toast.error(t('skillDrafts.rejectFailed'), { description: message })
    } finally {
      setBusySlug(null)
    }
  }

  return (
    <div className="px-3 pt-3 pb-1 border-b border-foreground/5">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">
        <FilePenLine className="size-3" />
        {t('skillDrafts.pendingTitle')}
      </div>
      <div className="flex flex-col gap-1.5">
        {drafts.map((draft) => (
          <div
            key={draft.slug}
            className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-2.5 py-2"
          >
            <div className="text-sm font-medium truncate">{draft.metadata.name}</div>
            <div className="text-xs text-muted-foreground truncate">{draft.metadata.description}</div>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                disabled={busySlug === draft.slug}
                onClick={() => handlePromote(draft.slug)}
                className="inline-flex h-7 items-center px-2.5 text-xs font-medium rounded-md bg-background shadow-minimal hover:bg-foreground/[0.03] disabled:opacity-50"
              >
                {t('skillDrafts.approve')}
              </button>
              <button
                type="button"
                disabled={busySlug === draft.slug}
                onClick={() => handleReject(draft.slug)}
                className="inline-flex h-7 items-center px-2.5 text-xs font-medium rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/[0.03] disabled:opacity-50"
              >
                {t('skillDrafts.reject')}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
