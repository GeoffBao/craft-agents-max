import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { useAtom, useAtomValue } from 'jotai'
import { Loader2, Search, ExternalLink, CheckCircle, AlertCircle, X } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { RendererTaskSummary, TeambitionTaskKind, ExecutionScope } from '@craft-agent/shared/protocol/dto'
import {
  teambitionTasksAtom,
  teambitionTasksLoadingAtom,
  teambitionTasksErrorAtom,
  teambitionCapabilitiesAtom,
  teambitionPickerOpenAtom,
} from '@/atoms/teambition'

// ---------------------------------------------------------------------------
// Task kind display configuration
// ---------------------------------------------------------------------------

const KIND_LABEL_KEY: Record<TeambitionTaskKind, string> = {
  feature: 'teambition.kind.feature',
  bug: 'teambition.kind.bug',
  task: 'teambition.kind.task',
}

const KIND_SORT_ORDER: Record<TeambitionTaskKind, number> = {
  feature: 0,
  bug: 1,
  task: 2,
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TeambitionTaskPickerProps {
  workspaceId: string
  /** Available Craft projects for scope binding */
  projects: { id: string; name: string }[]
  /** Called after a task is successfully claimed */
  onClaimed: (sessionId: string, taskId: string) => void
  /** Called when the picker is dismissed */
  onClose: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TeambitionTaskPicker({ workspaceId: _workspaceId, projects, onClaimed, onClose }: TeambitionTaskPickerProps) {
  const { t } = useTranslation()

  // Global state
  const tasks = useAtomValue(teambitionTasksAtom)
  const loading = useAtomValue(teambitionTasksLoadingAtom)
  const error = useAtomValue(teambitionTasksErrorAtom)
  const capabilities = useAtomValue(teambitionCapabilitiesAtom)

  // Local state
  const [search, setSearch] = React.useState('')
  const [selectedTask, setSelectedTask] = React.useState<RendererTaskSummary | null>(null)
  const [executionScope, setExecutionScope] = React.useState<ExecutionScope | null>(null)
  const [selectedProjectId, setSelectedProjectId] = React.useState<string>('')
  const [claiming, setClaiming] = React.useState(false)

  // Reset scope when task changes
  React.useEffect(() => {
    setExecutionScope(null)
    setSelectedProjectId('')
  }, [selectedTask?.taskId])

  // Filter and sort tasks
  const filteredTasks = React.useMemo(() => {
    let result = [...tasks]
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        t =>
          t.title.toLowerCase().includes(q) ||
          t.taskId.toLowerCase().includes(q) ||
          (t.projectName?.toLowerCase().includes(q) ?? false),
      )
    }
    result.sort((a, b) => {
      const orderDiff = (KIND_SORT_ORDER[a.kind] ?? 99) - (KIND_SORT_ORDER[b.kind] ?? 99)
      if (orderDiff !== 0) return orderDiff
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    })
    return result
  }, [tasks, search])

  // Determine scope based on task kind
  const requiredScope = selectedTask
    ? selectedTask.kind === 'feature' || selectedTask.kind === 'bug'
      ? 'project'
      : executionScope?.type ?? null
    : null

  const canClaim = selectedTask && (
    (requiredScope === 'project' && selectedProjectId) ||
    (requiredScope === 'workspace') ||
    (requiredScope === 'project' && executionScope?.type === 'project')
  )

  const handleScopeSelect = (scope: 'workspace' | 'project') => {
    if (scope === 'workspace') {
      setExecutionScope({ type: 'workspace' })
      setSelectedProjectId('')
    } else {
      setExecutionScope({ type: 'project', projectId: selectedProjectId || '' })
    }
  }

  const handleProjectSelect = (projectId: string) => {
    setSelectedProjectId(projectId)
    if (executionScope?.type === 'project') {
      setExecutionScope({ type: 'project', projectId })
    }
  }

  const handleClaim = async () => {
    if (!selectedTask) return
    setClaiming(true)
    try {
      const scope: ExecutionScope =
        selectedTask.kind === 'task' && !executionScope
          ? { type: 'workspace' }
          : selectedTask.kind === 'feature' || selectedTask.kind === 'bug'
            ? { type: 'project', projectId: selectedProjectId }
            : executionScope!

      const result = await window.electronAPI.claimTeambitionTask(_workspaceId, {
        workspaceId: _workspaceId,
        taskId: selectedTask.taskId,
        kind: selectedTask.kind,
        title: selectedTask.title,
        scope,
      })
      if (result.errorCode) {
        // 'binding_persist_failed' still returns a usable sessionId — the session and
        // snapshot exist, only the binding write failed. Surface the error but still
        // navigate so the user isn't stuck; a later retry can pass resumeSessionId.
        toast.error(t('teambition.claim.failed'), { description: result.error })
        if (result.errorCode === 'binding_persist_failed' && result.sessionId) {
          onClaimed(result.sessionId, result.taskId)
        }
        return
      }
      toast.success(
        result.created
          ? t('teambition.claim.created', { taskId: selectedTask.taskId })
          : t('teambition.claim.reused', { taskId: selectedTask.taskId }),
      )
      onClaimed(result.sessionId, result.taskId)
    } catch (err) {
      toast.error(t('teambition.claim.failed'), {
        description: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setClaiming(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="flex max-h-[80vh] w-[520px] flex-col rounded-xl border border-border bg-card shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">{t('teambition.picker.title')}</h2>
            <p className="mt-0.5 text-[11px] text-foreground/50">{t('teambition.picker.subtitle')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded-md text-foreground/50 transition-colors hover:bg-foreground/5 hover:text-foreground"
            aria-label={t('common.close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search */}
        <div className="border-b border-border/50 px-4 py-2">
          <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-background px-2.5 py-1.5">
            <Search className="h-3.5 w-3.5 text-foreground/35" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('teambition.picker.searchPlaceholder')}
              className="flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-foreground/35"
            />
          </div>
        </div>

        {/* Task list */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-foreground/50">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('common.loading')}
            </div>
          )}

          {error && (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-red-500">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}

          {!loading && !error && filteredTasks.length === 0 && (
            <div className="py-12 text-center text-sm text-foreground/45">
              {search.trim()
                ? t('teambition.picker.noResults')
                : t('teambition.picker.empty')}
            </div>
          )}

          {!loading &&
            filteredTasks.map(task => (
              <button
                key={task.taskId}
                type="button"
                onClick={() => setSelectedTask(task)}
                className={cn(
                  'w-full border-b border-border/40 px-4 py-3 text-left transition-colors',
                  selectedTask?.taskId === task.taskId
                    ? 'bg-foreground/[0.04]'
                    : 'hover:bg-foreground/[0.02]',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          'shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold uppercase leading-none',
                          task.kind === 'feature'
                            ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                            : task.kind === 'bug'
                              ? 'bg-red-500/10 text-red-600 dark:text-red-400'
                              : 'bg-foreground/5 text-foreground/55',
                        )}
                      >
                        {t(KIND_LABEL_KEY[task.kind])}
                      </span>
                      <span className="text-[10px] tabular-nums text-foreground/40">
                        {task.taskId}
                      </span>
                      {task.hasBinding && (
                        <CheckCircle className="h-3 w-3 text-emerald-500">
                          <title>{t('teambition.claim.alreadyClaimed')}</title>
                        </CheckCircle>
                      )}
                    </div>
                    <div className="mt-1 text-[13px] font-medium leading-snug text-foreground/85 line-clamp-2">
                      {task.title}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[10px] text-foreground/45">
                      {task.projectName && <span>{task.projectName}</span>}
                      <span>
                        {new Date(task.updatedAt).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            ))}
        </div>

        {/* Scope selection & claim */}
        {selectedTask && (
          <div className="border-t border-border/50 px-4 py-3">
            {/* Feature/Bug: force project selection */}
            {(selectedTask.kind === 'feature' || selectedTask.kind === 'bug') && (
              <div className="mb-3">
                <label className="mb-1.5 block text-[11px] font-medium text-foreground/70">
                  {t('teambition.claim.requiredProject')}
                </label>
                <select
                  value={selectedProjectId}
                  onChange={e => handleProjectSelect(e.target.value)}
                  className="w-full rounded-lg border border-border/60 bg-background px-2.5 py-2 text-xs text-foreground outline-none focus:border-primary/50"
                >
                  <option value="">{t('teambition.claim.selectProject')}</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Generic Task: scope choice */}
            {selectedTask.kind === 'task' && (
              <div className="mb-3 space-y-2">
                <label className="block text-[11px] font-medium text-foreground/70">
                  {t('teambition.claim.executionScope')}
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleScopeSelect('workspace')}
                    className={cn(
                      'flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors',
                      executionScope?.type === 'workspace'
                        ? 'border-primary/50 bg-primary/5 text-primary'
                        : 'border-border/60 text-foreground/70 hover:bg-foreground/[0.03]',
                    )}
                  >
                    {t('teambition.claim.workspaceOnly')}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleScopeSelect('project')}
                    className={cn(
                      'flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors',
                      executionScope?.type === 'project'
                        ? 'border-primary/50 bg-primary/5 text-primary'
                        : 'border-border/60 text-foreground/70 hover:bg-foreground/[0.03]',
                    )}
                  >
                    {t('teambition.claim.bindProject')}
                  </button>
                </div>
                {executionScope?.type === 'project' && (
                  <select
                    value={selectedProjectId}
                    onChange={e => {
                      handleProjectSelect(e.target.value)
                    }}
                    className="w-full rounded-lg border border-border/60 bg-background px-2.5 py-2 text-xs text-foreground outline-none focus:border-primary/50"
                  >
                    <option value="">{t('teambition.claim.selectProject')}</option>
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {/* Claim button */}
            <button
              type="button"
              disabled={!canClaim || claiming}
              onClick={handleClaim}
              className={cn(
                'flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-colors',
                canClaim
                  ? 'bg-primary text-primary-foreground hover:opacity-90'
                  : 'cursor-not-allowed bg-foreground/[0.06] text-foreground/30',
              )}
            >
              {claiming ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {t('teambition.claim.claiming')}
                </>
              ) : selectedTask.hasBinding ? (
                t('teambition.claim.openSession')
              ) : requiredScope === 'project' && !selectedProjectId ? (
                t('teambition.claim.selectProjectFirst')
              ) : (
                t('teambition.claim.claim', { taskId: selectedTask.taskId })
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
