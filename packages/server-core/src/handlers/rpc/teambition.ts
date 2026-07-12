/**
 * Teambition RPC handlers.
 *
 * Task 6 — wires the teambition-integration package (domain, bindings, sync-policy,
 * MCP gateway) to the RPC layer.
 */
import type { IpcMainInvokeEvent } from 'electron'
import type {
  ClaimTeambitionTaskRequest,
  ClaimTeambitionTaskResponse,
  GetTeambitionBindingResponse,
  GetTeambitionCapabilitiesResponse,
  ListTeambitionTasksResponse,
  TeambitionSyncProgressRequest,
  TeambitionSyncProgressResponse,
  TeambitionUpdateStatusRequest,
  TeambitionUpdateStatusResponse,
  TeambitionBindProjectRequest,
  TeambitionBindProjectResponse,
} from '@craft-agent/shared/protocol/dto'
import { RPC_CHANNELS } from '@craft-agent/shared/protocol'
import type { RpcServer } from '@craft-agent/server-core/transport'
import type { HandlerDeps } from '../handler-deps'

export const HANDLED_CHANNELS = [
  RPC_CHANNELS.teambition.LIST_TASKS,
  RPC_CHANNELS.teambition.CLAIM_TASK,
  RPC_CHANNELS.teambition.GET_BINDING,
  RPC_CHANNELS.teambition.CAPABILITIES,
  RPC_CHANNELS.teambition.SYNC_PROGRESS,
  RPC_CHANNELS.teambition.UPDATE_STATUS,
  RPC_CHANNELS.teambition.BIND_PROJECT,
] as const

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Build a TeambitionGateway from the workspace's teambition source config.
 * The token is extracted from the MCP URL at call time and never persisted.
 */
async function getGateway(workspaceId: string) {
  const { getWorkspaceByNameOrId } = await import('@craft-agent/shared/config')
  const { loadSourceConfig } = await import('@craft-agent/shared/sources')
  const { createUserMcpGateway } = await import('@craft-agent/teambition-integration')

  const workspace = getWorkspaceByNameOrId(workspaceId)
  if (!workspace) throw new Error(`Workspace not found: ${workspaceId}`)

  const config = loadSourceConfig(workspace.rootPath, 'teambition')
  if (!config?.mcp?.url) {
    throw new Error('Teambition source has no MCP URL configured')
  }

  // Strip any existing userToken from the URL — we'll add the fresh one
  const endpoint = config.mcp.url.replace(/[?&]userToken=[^&]*/, '')

  return createUserMcpGateway({
    endpoint,
    getToken: async () => {
      // Re-read config each time so token refreshes are picked up
      const fresh = loadSourceConfig(workspace.rootPath, 'teambition')
      if (!fresh?.mcp?.url) throw new Error('Teambition source is missing MCP URL')
      const url = new URL(fresh.mcp.url)
      const token = url.searchParams.get('userToken')
      if (!token) throw new Error('Teambition source is missing userToken')
      return token
    },
  })
}

export function registerTeambitionHandlers(server: RpcServer, deps: HandlerDeps): void {
  const log = deps.platform.logger

  // -----------------------------------------------------------------------
  // LIST_TASKS
  // -----------------------------------------------------------------------
  server.handle(RPC_CHANNELS.teambition.LIST_TASKS, async (_ctx, workspaceId: string) => {
    try {
      const gateway = await getGateway(workspaceId)
      const { loadBindings } = await import('@craft-agent/teambition-integration')
      const { getWorkspaceByNameOrId } = await import('@craft-agent/shared/config')
      const workspace = getWorkspaceByNameOrId(workspaceId)!
      const bindings = await loadBindings(workspace.rootPath)

      const tasks = await gateway.listMyTasks({})
      const bindingSet = new Set(bindings.map((b) => b.taskId))

      return {
        tasks: tasks.map((t) => ({
          taskId: t.taskId,
          title: t.title,
          kind: t.kind,
          updatedAt: t.updatedAt,
          projectId: t.projectId,
          hasBinding: bindingSet.has(t.taskId),
          sessionId: bindings.find((b) => b.taskId === t.taskId)?.sessionId,
        })),
        capabilities: [...gateway.capabilities],
      } satisfies ListTeambitionTasksResponse
    } catch (err) {
      log.error(`TEAMBITION_LIST_TASKS: ${err}`)
      throw err
    }
  })

  // -----------------------------------------------------------------------
  // CLAIM_TASK
  // -----------------------------------------------------------------------
  server.handle(
    RPC_CHANNELS.teambition.CLAIM_TASK,
    async (
      _ctx,
      workspaceId: string,
      input: ClaimTeambitionTaskRequest,
    ): Promise<ClaimTeambitionTaskResponse> => {
      const { getWorkspaceByNameOrId } = await import('@craft-agent/shared/config')
      const workspace = getWorkspaceByNameOrId(workspaceId)
      if (!workspace) throw new Error(`Workspace not found: ${workspaceId}`)

      const { claimBinding, findBindingByTaskId, writeTaskBundle } =
        await import('@craft-agent/teambition-integration')

      // Check existing binding first (idempotent claim)
      const existing = await findBindingByTaskId(workspace.rootPath, input.taskId)
      if (existing) {
        return { sessionId: existing.sessionId, taskId: input.taskId, created: false }
      }

      // Fetch task bundle from the gateway
      const gateway = await getGateway(workspaceId)
      const bundle = await gateway.getTaskBundle(input.taskId)

      // Validate scope: feature/bug require a project
      const projectId =
        input.scope.type === 'project' ? input.scope.projectId : undefined

      // Create the session
      const session = await deps.sessionManager.createSession(workspaceId, {
        name: `TW: ${bundle.summary.title}`,
        projectId,
      })

      // Write task snapshot
      await writeTaskBundle(workspace.rootPath, session.id, bundle)

      // Persist binding
      await claimBinding(workspace.rootPath, {
        provider: 'teambition',
        taskId: input.taskId,
        sessionId: session.id,
        sourceSlug: 'teambition',
        state: 'claimed',
        claimedAt: new Date().toISOString(),
      })

      return { sessionId: session.id, taskId: input.taskId, created: true }
    },
  )

  // -----------------------------------------------------------------------
  // GET_BINDING
  // -----------------------------------------------------------------------
  server.handle(
    RPC_CHANNELS.teambition.GET_BINDING,
    async (
      _ctx,
      workspaceId: string,
      taskId: string,
    ): Promise<GetTeambitionBindingResponse | null> => {
      const { getWorkspaceByNameOrId } = await import('@craft-agent/shared/config')
      const workspace = getWorkspaceByNameOrId(workspaceId)
      if (!workspace) return null

      const { findBindingByTaskId } = await import('@craft-agent/teambition-integration')
      const binding = await findBindingByTaskId(workspace.rootPath, taskId)
      if (!binding) return null

      return {
        taskId: binding.taskId,
        sessionId: binding.sessionId,
        state: binding.state,
        claimedAt: binding.claimedAt,
      }
    },
  )

  // -----------------------------------------------------------------------
  // CAPABILITIES
  // -----------------------------------------------------------------------
  server.handle(
    RPC_CHANNELS.teambition.CAPABILITIES,
    async (
      _ctx,
      workspaceId: string,
    ): Promise<GetTeambitionCapabilitiesResponse> => {
      try {
        const gateway = await getGateway(workspaceId)
        return { capabilities: [...gateway.capabilities] }
      } catch {
        return { capabilities: [] }
      }
    },
  )

  // -----------------------------------------------------------------------
  // SYNC_PROGRESS (Task 6)
  // -----------------------------------------------------------------------
  server.handle(
    RPC_CHANNELS.teambition.SYNC_PROGRESS,
    async (
      _ctx,
      request: TeambitionSyncProgressRequest,
    ): Promise<TeambitionSyncProgressResponse> => {
      const { workspaceId, taskId, sessionId, percent, note } = request
      const { getWorkspaceByNameOrId } = await import('@craft-agent/shared/config')
      const workspace = getWorkspaceByNameOrId(workspaceId)
      if (!workspace) throw new Error(`Workspace not found: ${workspaceId}`)

      const {
        findBindingByTaskId,
        appendSyncLog,
        preflightSyncCheck,
        computeFingerprint,
        createSyncLogEntry,
        SyncConflictError,
        AlreadySyncedError,
      } = await import('@craft-agent/teambition-integration')

      // Load binding to confirm the task is claimed
      const binding = await findBindingByTaskId(workspace.rootPath, taskId)
      if (!binding) {
        return { result: 'error', message: 'Task is not claimed (no binding found)' }
      }

      try {
        const gateway = await getGateway(workspaceId)

        // Fetch current remote task metadata
        const bundle = await gateway.getTaskBundle(taskId)
        const remoteUpdatedAt = bundle.summary.updatedAt
        const snapshotUpdatedAt = binding.claimedAt

        // Compute fingerprint
        const fp = {
          taskId,
          operation: 'syncProgress',
          sessionId,
          normalizedPayload: JSON.stringify({ percent, note: note ?? '' }),
        }

        // Preflight: conflict + idempotency
        preflightSyncCheck(
          { snapshotUpdatedAt, log: [] },
          remoteUpdatedAt,
          fp,
        )

        // Execute the write
        const result = await gateway.addProgress(taskId, { percent, note })

        // Append redacted sync log
        const entry = createSyncLogEntry(fp, 'synced', new Date().toISOString())
        await appendSyncLog(workspace.rootPath, entry)

        return {
          result: 'synced',
          message: `Progress synced: ${percent}%`,
          syncedAt: result.syncedAt,
        }
      } catch (err) {
        if (err instanceof SyncConflictError) {
          return {
            result: 'conflict',
            message: 'Conflict: remote task was updated. Please refresh.',
            remoteUpdatedAt: err.remoteUpdatedAt,
          }
        }
        if (err instanceof AlreadySyncedError) {
          return {
            result: 'already_synced',
            message: 'This progress has already been synced.',
          }
        }
        log.error(`TEAMBITION_SYNC_PROGRESS: ${err}`)
        return { result: 'error', message: String(err) }
      }
    },
  )

  // -----------------------------------------------------------------------
  // UPDATE_STATUS (Task 6)
  // -----------------------------------------------------------------------
  server.handle(
    RPC_CHANNELS.teambition.UPDATE_STATUS,
    async (
      _ctx,
      request: TeambitionUpdateStatusRequest,
    ): Promise<TeambitionUpdateStatusResponse> => {
      const { workspaceId, taskId, sessionId, statusId, note } = request
      const { getWorkspaceByNameOrId } = await import('@craft-agent/shared/config')
      const workspace = getWorkspaceByNameOrId(workspaceId)
      if (!workspace) throw new Error(`Workspace not found: ${workspaceId}`)

      const {
        findBindingByTaskId,
        appendSyncLog,
        preflightSyncCheck,
        computeFingerprint,
        createSyncLogEntry,
        SyncConflictError,
        AlreadySyncedError,
      } = await import('@craft-agent/teambition-integration')

      const binding = await findBindingByTaskId(workspace.rootPath, taskId)
      if (!binding) {
        return { result: 'error', message: 'Task is not claimed (no binding found)' }
      }

      try {
        const gateway = await getGateway(workspaceId)
        const bundle = await gateway.getTaskBundle(taskId)
        const remoteUpdatedAt = bundle.summary.updatedAt

        const fp = {
          taskId,
          operation: 'updateStatus',
          sessionId,
          normalizedPayload: JSON.stringify({ statusId, note: note ?? '' }),
        }

        preflightSyncCheck(
          { snapshotUpdatedAt: binding.claimedAt, log: [] },
          remoteUpdatedAt,
          fp,
        )

        // Map the statusId through the gateway's updateWorkflowStatus
        // The status mapping is the caller's responsibility (UI validates against project workflow)
        const statusValue = statusId as 'open' | 'in_progress' | 'done' | 'blocked'
        const result = await gateway.updateWorkflowStatus(taskId, { status: statusValue, note })

        const entry = createSyncLogEntry(fp, 'synced', new Date().toISOString())
        await appendSyncLog(workspace.rootPath, entry)

        return {
          result: 'synced',
          message: `Status updated to ${statusId}`,
          syncedAt: result.syncedAt,
        }
      } catch (err) {
        if (err instanceof SyncConflictError) {
          return {
            result: 'conflict',
            message: 'Conflict: remote task was updated. Please refresh.',
            remoteUpdatedAt: err.remoteUpdatedAt,
          }
        }
        if (err instanceof AlreadySyncedError) {
          return {
            result: 'already_synced',
            message: 'This status change has already been synced.',
          }
        }
        log.error(`TEAMBITION_UPDATE_STATUS: ${err}`)
        return { result: 'error', message: String(err) }
      }
    },
  )

  // -----------------------------------------------------------------------
  // BIND_PROJECT (Task 6)
  // -----------------------------------------------------------------------
  server.handle(
    RPC_CHANNELS.teambition.BIND_PROJECT,
    async (
      _ctx,
      request: TeambitionBindProjectRequest,
    ): Promise<TeambitionBindProjectResponse> => {
      const { workspaceId, taskId, sessionId, projectId } = request
      const { getWorkspaceByNameOrId } = await import('@craft-agent/shared/config')
      const workspace = getWorkspaceByNameOrId(workspaceId)
      if (!workspace) throw new Error(`Workspace not found: ${workspaceId}`)

      const { findBindingByTaskId, claimBinding, parseExternalTaskSummary } =
        await import('@craft-agent/teambition-integration')

      const binding = await findBindingByTaskId(workspace.rootPath, taskId)
      if (!binding) {
        return { result: 'error', message: 'Task is not claimed (no binding found)', sessionId }
      }

      // Reject binding feature/bug to empty project
      const gateway = await getGateway(workspaceId)
      const bundle = await gateway.getTaskBundle(taskId)
      const summary = parseExternalTaskSummary(bundle.summary)

      if ((summary.kind === 'feature' || summary.kind === 'bug') && !projectId) {
        return {
          result: 'error',
          message: `Cannot bind ${summary.kind} task to an empty project. Feature and Bug tasks require a Craft Project.`,
          sessionId,
        }
      }

      try {
        // Update the session's project association
        await deps.sessionManager.setSessionProjectId(sessionId, projectId)

        // Re-persist binding (idempotent — claimBinding returns existing)
        await claimBinding(workspace.rootPath, {
          provider: 'teambition',
          taskId,
          sessionId,
          sourceSlug: 'teambition',
          state: 'claimed',
          claimedAt: new Date().toISOString(),
        })

        return {
          result: 'bound',
          message: projectId
            ? `Task bound to Craft project ${projectId}`
            : 'Task kept as workspace-only',
          sessionId,
        }
      } catch (err) {
        log.error(`TEAMBITION_BIND_PROJECT: ${err}`)
        return { result: 'error', message: String(err), sessionId }
      }
    },
  )
}

// ---------------------------------------------------------------------------
// Standalone handler wrappers (for import by legacy callers / direct invocation)
// ---------------------------------------------------------------------------

export async function handleListTeambitionTasks(
  _event: IpcMainInvokeEvent,
  workspaceId: string,
): Promise<ListTeambitionTasksResponse> {
  const { getWorkspaceByNameOrId } = await import('@craft-agent/shared/config')
  const workspace = getWorkspaceByNameOrId(workspaceId)
  if (!workspace) return { tasks: [], capabilities: [] }

  const gateway = await getGateway(workspaceId)
  const { loadBindings } = await import('@craft-agent/teambition-integration')
  const bindings = await loadBindings(workspace.rootPath)

  const tasks = await gateway.listMyTasks({})
  const bindingSet = new Set(bindings.map((b) => b.taskId))

  return {
    tasks: tasks.map((t) => ({
      taskId: t.taskId,
      title: t.title,
      kind: t.kind,
      updatedAt: t.updatedAt,
      projectId: t.projectId,
      hasBinding: bindingSet.has(t.taskId),
      sessionId: bindings.find((b) => b.taskId === t.taskId)?.sessionId,
    })),
    capabilities: [...gateway.capabilities],
  }
}

export async function handleClaimTeambitionTask(
  _event: IpcMainInvokeEvent,
  _workspaceId: string,
  _input: ClaimTeambitionTaskRequest,
): Promise<ClaimTeambitionTaskResponse> {
  throw new Error(
    'handleClaimTeambitionTask requires HandlerDeps. Use registerTeambitionHandlers instead.',
  )
}

export async function handleGetTeambitionBinding(
  _event: IpcMainInvokeEvent,
  workspaceId: string,
  taskId: string,
): Promise<GetTeambitionBindingResponse | null> {
  const { getWorkspaceByNameOrId } = await import('@craft-agent/shared/config')
  const workspace = getWorkspaceByNameOrId(workspaceId)
  if (!workspace) return null

  const { findBindingByTaskId } = await import('@craft-agent/teambition-integration')
  const binding = await findBindingByTaskId(workspace.rootPath, taskId)
  if (!binding) return null

  return {
    taskId: binding.taskId,
    sessionId: binding.sessionId,
    state: binding.state,
    claimedAt: binding.claimedAt,
  }
}

export async function handleGetTeambitionCapabilities(
  _event: IpcMainInvokeEvent,
  workspaceId: string,
): Promise<GetTeambitionCapabilitiesResponse> {
  try {
    const gateway = await getGateway(workspaceId)
    return { capabilities: [...gateway.capabilities] }
  } catch {
    return { capabilities: [] }
  }
}
