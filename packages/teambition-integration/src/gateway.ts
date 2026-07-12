import type {
  ExternalTaskBundle,
  ExternalTaskSummary,
  ListMyTasksInput,
  ProgressInput,
  SyncResult,
  TeambitionUser,
  WorktimeInput,
  WorkflowStatusInput,
} from './domain'

export type TeambitionCapability =
  | 'identity'
  | 'task.list'
  | 'task.detail'
  | 'task.progress.read'
  | 'task.progress.write'
  | 'task.status.write'
  | 'task.comment.write'
  | 'worktime.read'
  | 'worktime.write'

export interface TeambitionGatewayCapabilities {
  readonly capabilities: readonly TeambitionCapability[]
}

export interface TeambitionGateway extends TeambitionGatewayCapabilities {
  getCurrentUser(): Promise<TeambitionUser>
  listMyTasks(input: ListMyTasksInput): Promise<ExternalTaskSummary[]>
  getTaskBundle(taskId: string): Promise<ExternalTaskBundle>
  addProgress(taskId: string, input: ProgressInput): Promise<SyncResult>
  updateWorkflowStatus(taskId: string, input: WorkflowStatusInput): Promise<SyncResult>
  addComment(taskId: string, content: string): Promise<SyncResult>
  recordWorktime?: (taskId: string, input: WorktimeInput) => Promise<SyncResult>
}
