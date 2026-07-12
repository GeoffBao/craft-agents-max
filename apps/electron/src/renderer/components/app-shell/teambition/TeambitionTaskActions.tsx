import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { ExternalLink, RefreshCw, Send, GitPullRequestArrow, Clock, FolderSync } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TeambitionCapabilityDto } from '@craft-agent/shared/protocol/dto'
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
  kind: string
  syncState: TeambitionSyncState
  capabilities: TeambitionCapabilityDto[]
  /** Whether this is a workspace-only task (no Craft project binding) */
  isWorkspaceOnly: boolean
  /** Called to open the TW task in browser */
  onView?: () => void
  /** Called to refresh the task snapshot */
  onRefresh?: () => void
  /** Called to sync Agent progress back to TW */
  onSyncProgress?: () => void
  /** Called to update TW workflow status */
  onUpdateStatus?: () => void
  /** Called to bind a workspace-only task to a Craft project */
  onBindProject?: () => void
  /** Called to record worktime (hidden when capability absent) */
  onRecordWorktime?: () => void
  className?: string
}

/**
 * Dropdown menu of explicit Teambition actions for a bound Kanban task.
 * Operations that are unavailable (missing capability, wrong scope) are hidden
 * rather than disabled so the menu stays compact.
 */
export function TeambitionTaskActions({
  taskId: _taskId,
  syncState,
  capabilities,
  isWorkspaceOnly,
  onView,
  onRefresh,
  onSyncProgress,
  onUpdateStatus,
  onBindProject,
  onRecordWorktime,
  className,
}: TeambitionTaskActionsProps) {
  const { t } = useTranslation()

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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-no-dnd="true"
          onClick={e => e.stopPropagation()}
          onKeyDown={e => e.stopPropagation()}
          className={cn(
            'grid h-6 w-6 shrink-0 place-items-center rounded-md border border-border/60 bg-card text-foreground/50 shadow-minimal transition-colors hover:bg-foreground/[0.05] hover:text-foreground',
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
        </DropdownMenuLabel>
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
        {hasProgressWrite && onSyncProgress && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onSyncProgress}>
              <GitPullRequestArrow className="h-3.5 w-3.5" />
              {t('teambition.actions.syncProgress')}
            </DropdownMenuItem>
          </>
        )}
        {hasStatusWrite && onUpdateStatus && (
          <DropdownMenuItem onSelect={onUpdateStatus}>
            <Send className="h-3.5 w-3.5" />
            {t('teambition.actions.updateStatus')}
          </DropdownMenuItem>
        )}
        {isWorkspaceOnly && onBindProject && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onBindProject}>
              <FolderSync className="h-3.5 w-3.5" />
              {t('teambition.actions.bindProject')}
            </DropdownMenuItem>
          </>
        )}
        {hasWorktimeWrite && onRecordWorktime && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onRecordWorktime}>
              <Clock className="h-3.5 w-3.5" />
              {t('teambition.actions.recordWorktime')}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
