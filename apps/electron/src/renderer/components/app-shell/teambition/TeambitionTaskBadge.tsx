import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import type { TeambitionTaskKind } from '@craft-agent/shared/protocol/dto'

const KIND_CONFIG: Record<TeambitionTaskKind, { labelKey: string; className: string }> = {
  feature: {
    labelKey: 'teambition.kind.feature',
    className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
  },
  bug: {
    labelKey: 'teambition.kind.bug',
    className: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
  },
  task: {
    labelKey: 'teambition.kind.task',
    className: 'bg-foreground/5 text-foreground/60 border-border/60',
  },
}

interface TeambitionTaskBadgeProps {
  taskId: string
  kind: TeambitionTaskKind
  projectName?: string
  className?: string
}

/**
 * Compact Teambition badge shown on a Kanban TaskTile.
 * Displays the TW task kind icon + task ID + optional project name.
 */
export function TeambitionTaskBadge({ taskId, kind, projectName, className }: TeambitionTaskBadgeProps) {
  const { t } = useTranslation()
  const config = KIND_CONFIG[kind]

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium leading-none',
        config.className,
        className,
      )}
      title={`Teambition ${t(config.labelKey)}: ${taskId}${projectName ? ` · ${projectName}` : ''}`}
    >
      <span className="font-semibold uppercase tracking-wider opacity-70">{kind.slice(0, 2)}</span>
      <span className="tabular-nums opacity-80">{taskId}</span>
    </span>
  )
}
