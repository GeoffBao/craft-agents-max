export type TeambitionTaskKind = 'feature' | 'bug' | 'task'

export type ExecutionScope =
  | { type: 'workspace' }
  | { type: 'project'; projectId: string }

export interface TeambitionBinding {
  projectId: string
  scope: ExecutionScope
}

export interface ExternalTaskSummary {
  taskId: string
  title: string
  kind: TeambitionTaskKind
  updatedAt: string
  projectId?: string
}

export interface ExternalTaskComment {
  commentId: string
  content: string
  createdAt: string
}

export interface ExternalTaskProgress {
  percent: number
  updatedAt: string
  note?: string
}

export interface ExternalTaskBundle {
  summary: ExternalTaskSummary
  binding?: TeambitionBinding
  comments: ExternalTaskComment[]
  progress?: ExternalTaskProgress
}

export interface SyncResult {
  taskId: string
  syncedAt: string
  changed: boolean
  message?: string
}

export interface TeambitionUser {
  userId: string
  displayName: string
  email?: string
}

export interface ListMyTasksInput {
  scope?: ExecutionScope
  cursor?: string
  limit?: number
}

export interface ProgressInput {
  percent: number
  note?: string
}

export interface WorkflowStatusInput {
  status: 'open' | 'in_progress' | 'done' | 'blocked'
  note?: string
}

export interface WorktimeInput {
  minutes: number
  startedAt?: string
  endedAt?: string
  note?: string
}

function requireText(value: string, fieldName: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error(`Teambition external task summary requires a non-empty ${fieldName}`)
  }
  return trimmed
}

function requireProjectId(summary: ExternalTaskSummary): string {
  const projectId = summary.projectId?.trim()
  if (!projectId) {
    throw new Error(`Teambition ${summary.kind} tasks require a projectId`)
  }
  return projectId
}

export function parseExternalTaskSummary(summary: ExternalTaskSummary): ExternalTaskSummary {
  const taskId = requireText(summary.taskId, 'taskId')
  const title = requireText(summary.title, 'title')
  const updatedAt = requireText(summary.updatedAt, 'updatedAt')

  if (summary.kind !== 'feature' && summary.kind !== 'bug' && summary.kind !== 'task') {
    throw new Error(`Unsupported Teambition task kind: ${summary.kind satisfies never}`)
  }

  const projectId =
    summary.kind === 'task'
      ? summary.projectId?.trim() || undefined
      : requireProjectId(summary)

  return {
    taskId,
    title,
    kind: summary.kind,
    updatedAt,
    ...(projectId ? { projectId } : {}),
  }
}
