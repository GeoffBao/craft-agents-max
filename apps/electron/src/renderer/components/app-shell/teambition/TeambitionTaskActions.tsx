import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { ExternalLink, RefreshCw, Send, GitPullRequestArrow, Clock, FolderSync, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type {
  TeambitionCapabilityDto,
  TeambitionSyncProgressRequest,
  TeambitionSyncProgressResponse,
  TeambitionUpdateStatusRequest,
  TeambitionUpdateStatusResponse,
  TeambitionBindProjectRequest,
  TeambitionBindProjectResponse,
} from '@craft-agent/shared/protocol/dto'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export type TeambitionSyncState = 'synced' | 'pending' | 'conflict' | 'stale'

interface TeambitionTaskActionsProps {
  taskId: string
  /** The Craft session ID bound to this TW task */
  sessionId: string
  /** The workspace ID */
  workspaceId: string
  kind: string
  syncState: TeambitionSyncState
  capabilities: TeambitionCapabilityDto[]
  /** Whether this is a workspace-only task (no Craft project binding) */
  isWorkspaceOnly: boolean
  /** Called to open the TW task in browser */
  onView?: () => void
  /** Called to refresh the task snapshot */
  onRefresh?: () => void
  /** Called when sync state changes (for parent to update UI) */
  onSyncStateChange?: (state: TeambitionSyncState) => void
  className?: string
}

/**
 * Dropdown menu of explicit Teambition actions for a bound Kanban task.
 *
 * Task 6: Wired to actual RPC calls (syncProgress, updateStatus, bindProject)
 * with conflict detection, idempotency, and pending-sync states.
 */
export function TeambitionTaskActions({
  taskId,
  sessionId,
  workspaceId,
  syncState,
  capabilities,
  isWorkspaceOnly,
  onView,
  onRefresh,
  onSyncStateChange,
  className,
}: TeambitionTaskActionsProps) {
  const { t } = useTranslation()
  const [pendingOp, setPendingOp] = React.useState<string | null>(null)
  const [lastMessage, setLastMessage] = React.useState<string | null>(null)

  const hasProgressWrite = capabilities.includes('task.progress.write')
  const hasStatusWrite = capabilities.includes('task.status.write')
  const hasWorktimeWrite = capabilities.includes('worktime.write')

  const syncLabel =
    syncState === 'synced'
      ? t('teambition.syncState.synced')
      : syncState === 'pending'
        ? t('teambition.syncState.pending')
        : syncState === 'conflict'
          ? t('teambition.syncState.conflict')
          : t('teambition.syncState.stale')

  // -------------------------------------------------------------------
  // Sync progress
  // -------------------------------------------------------------------
  const handleSyncProgress = React.useCallback(async () => {
    setPendingOp('syncProgress')
    setLastMessage(null)
    try {
      const req: TeambitionSyncProgressRequest = {
        workspaceId,
        taskId,
        sessionId,
        percent: 100,
        note: t('teambition.sync.defaultProgressNote'),
      }
      const res: TeambitionSyncProgressResponse =
        await window.electronAPI.syncTeambitionProgress(req)

      if (res.result === 'synced') {
        onSyncStateChange?.('synced')
        setLastMessage(t('teambition.sync.progressSynced'))
      } else if (res.result === 'conflict') {
        onSyncStateChange?.('conflict')
        setLastMessage(t('teambition.sync.needRefresh'))
      } else if (res.result === 'already_synced') {
        setLastMessage(t('teambition.sync.alreadySynced'))
      } else {
        // Network failure — retain local result, show pending
        onSyncStateChange?.('pending')
        setLastMessage(t('teambition.sync.networkError'))
      }
    } catch (err) {
      onSyncStateChange?.('pending')
      setLastMessage(t('teambition.sync.networkError'))
    } finally {
      setPendingOp(null)
    }
  }, [workspaceId, taskId, sessionId, t, onSyncStateChange])

  // -------------------------------------------------------------------
  // Update workflow status
  // -------------------------------------------------------------------
  const handleUpdateStatus = React.useCallback(async () => {
    setPendingOp('updateStatus')
    setLastMessage(null)
    try {
      // Status IDs must come from the actual Teambition project workflow;
      // the UI must present available statuses from the project definition.
      // Here we use a default 'in_progress' as the most common transition.
      const req: TeambitionUpdateStatusRequest = {
        workspaceId,
        taskId,
        sessionId,
        statusId: 'in_progress',
      }
      const res: TeambitionUpdateStatusResponse =
        await window.electronAPI.updateTeambitionStatus(req)

      if (res.result === 'synced') {
        onSyncStateChange?.('synced')
        setLastMessage(t('teambition.sync.statusUpdated'))
      } else if (res.result === 'conflict') {
        onSyncStateChange?.('conflict')
        setLastMessage(t('teambition.sync.needRefresh'))
      } else if (res.result === 'already_synced') {
        setLastMessage(t('teambition.sync.alreadySynced'))
      } else {
        onSyncStateChange?.('pending')
        setLastMessage(t('teambition.sync.networkError'))
      }
    } catch (err) {
      onSyncStateChange?.('pending')
      setLastMessage(t('teambition.sync.networkError'))
    } finally {
      setPendingOp(null)
    }
  }, [workspaceId, taskId, sessionId, t, onSyncStateChange])

  // -------------------------------------------------------------------
  // Bind project
  // -------------------------------------------------------------------
  const handleBindProject = React.useCallback(async () => {
    setPendingOp('bindProject')
    setLastMessage(null)
    try {
      const req: TeambitionBindProjectRequest = {
        workspaceId,
        taskId,
        sessionId,
        // For now, bind to the current project context (caller should provide)
        // For a workspace-only task being bound, we need a project picker.
        // This is a simplified version — full implementation requires a project selector modal.
        projectId: null, // Keep as workspace-only for now
      }
      const res: TeambitionBindProjectResponse =
        await window.electronAPI.bindTeambitionProject(req)

      if (res.result === 'bound' || res.result === 'already_bound') {
        setLastMessage(t('teambition.sync.projectBound'))
      } else {
        setLastMessage(res.message)
      }
    } catch (err) {
      setLastMessage(t('teambition.sync.networkError'))
    } finally {
      setPendingOp(null)
    }
  }, [workspaceId, taskId, sessionId, t])

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-no-dnd="true"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          className={cn(
            'grid h-6 w-6 shrink-0 place-items-center rounded-md border border-border/60 bg-card text-foreground/50 shadow-minimal transition-colors hover:bg-foreground/[0.05] hover:text-foreground',
            syncState === 'conflict' && 'border-amber-500/50 text-amber-500',
            syncState === 'pending' && 'border-blue-500/50 text-blue-500',
            className,
          )}
          title={t('teambition.actions.title')}
          aria-label={t('teambition.actions.title')}
        >
          <Send className="h-3 w-3" strokeWidth={2} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="text-[10px] font-normal text-foreground/50">
          Teambition · {syncLabel}
          {pendingOp && (
            <span className="ml-1 animate-pulse">
              · {t('teambition.sync.syncing')}
            </span>
          )}
        </DropdownMenuLabel>

        {lastMessage && (
          <div className="px-2 py-1 text-[10px] text-foreground/60 border-b border-border/30">
            {lastMessage}
          </div>
        )}

        {syncState === 'conflict' && (
          <div className="flex items-center gap-1 px-2 py-1 text-[10px] text-amber-500 border-b border-border/30">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            {t('teambition.sync.needRefresh')}
          </div>
        )}

        {onView && (
          <DropdownMenuItem onSelect={onView}>
            <ExternalLink className="h-3.5 w-3.5" />
            {t('teambition.actions.view')}
          </DropdownMenuItem>
        )}
        {onRefresh && (
          <DropdownMenuItem onSelect={onRefresh}>
            <RefreshCw className="h-3.5 w-3.5" />
            {t('teambition.actions.refresh')}
          </DropdownMenuItem>
        )}

        {hasProgressWrite && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={handleSyncProgress}
              disabled={pendingOp !== null}
            >
              <GitPullRequestArrow className="h-3.5 w-3.5" />
              {pendingOp === 'syncProgress'
                ? t('teambition.sync.syncing')
                : t('teambition.actions.syncProgress')}
            </DropdownMenuItem>
          </>
        )}

        {hasStatusWrite && (
          <DropdownMenuItem
            onSelect={handleUpdateStatus}
            disabled={pendingOp !== null}
          >
            <Send className="h-3.5 w-3.5" />
            {pendingOp === 'updateStatus'
              ? t('teambition.sync.syncing')
              : t('teambition.actions.updateStatus')}
          </DropdownMenuItem>
        )}

        {isWorkspaceOnly && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={handleBindProject}
              disabled={pendingOp !== null}
            >
              <FolderSync className="h-3.5 w-3.5" />
              {pendingOp === 'bindProject'
                ? t('teambition.sync.syncing')
                : t('teambition.actions.bindProject')}
            </DropdownMenuItem>
          </>
        )}

        {hasWorktimeWrite && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled>
              <Clock className="h-3.5 w-3.5" />
              {t('teambition.actions.recordWorktime')}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
