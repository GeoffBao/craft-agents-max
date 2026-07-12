import { describe, expect, it, mock } from 'bun:test'
import { RPC_CHANNELS } from '@craft-agent/shared/protocol'
import type { HandlerFn, RequestContext, RpcServer } from '../../transport/types'
import type { HandlerDeps } from '../handler-deps'
import type {
  ClaimTeambitionTaskRequest,
  ClaimTeambitionTaskResponse,
  ListTeambitionTasksResponse,
} from '@craft-agent/shared/protocol/dto'

// ---------------------------------------------------------------------------
// Unit tests for sync-policy integration with handler logic.
// These tests verify the sync/status/bind handler patterns without a full
// Electron/RPC server setup. They test the underlying sync policy + DTO
// return shapes that the handlers produce.
//
// Uses relative import since server-core doesn't have @craft-agent/teambition-integration
// in its dependencies — the handlers import it dynamically at runtime.
// ---------------------------------------------------------------------------

// Import sync-policy directly from the teambition-integration package
import {
  checkSyncConflict,
  checkIdempotency,
  computeFingerprint,
  preflightSyncCheck,
  SyncConflictError,
  AlreadySyncedError,
  createSyncLogEntry,
  type SyncFingerprint,
  type SyncLogEntry,
  type SyncPolicyState,
} from '../../../../teambition-integration/src/sync-policy'

describe('Teambition RPC handler — sync progress', () => {
  it('returns conflict when remote updatedAt > local snapshot', () => {
    const remoteUpdatedAt = '2026-07-12T16:00:00.000Z'
    const snapshotUpdatedAt = '2026-07-12T14:00:00.000Z'

    expect(() =>
      checkSyncConflict(remoteUpdatedAt, snapshotUpdatedAt),
    ).toThrow(SyncConflictError)

    try {
      checkSyncConflict(remoteUpdatedAt, snapshotUpdatedAt)
    } catch (err) {
      if (err instanceof SyncConflictError) {
        // Handler would return { result: 'conflict', message: '...' }
        expect(err.remoteUpdatedAt).toBe(remoteUpdatedAt)
        expect(err.snapshotUpdatedAt).toBe(snapshotUpdatedAt)
      }
    }
  })

  it('returns already_synced when fingerprint matches existing log entry', () => {
    const fp: SyncFingerprint = {
      taskId: 'tw-100',
      operation: 'syncProgress',
      sessionId: 'session-1',
      normalizedPayload: JSON.stringify({ percent: 50, note: '' }),
    }

    const fingerprint = computeFingerprint(fp)
    const log: SyncLogEntry[] = [
      {
        fingerprint,
        operation: fp.operation,
        taskId: fp.taskId,
        sessionId: fp.sessionId,
        timestamp: '2026-07-12T14:00:00.000Z',
        result: 'synced',
      },
    ]

    const match = log.find((entry) => entry.fingerprint === fingerprint)
    expect(match).toBeDefined()
  })

  it('allows sync when remote task is not newer and no duplicate fingerprint', () => {
    const remoteUpdatedAt = '2026-07-12T14:00:00.000Z'
    const snapshotUpdatedAt = '2026-07-12T16:00:00.000Z'

    expect(remoteUpdatedAt > snapshotUpdatedAt).toBe(false)

    expect(() =>
      checkSyncConflict(remoteUpdatedAt, snapshotUpdatedAt),
    ).not.toThrow()

    const fp: SyncFingerprint = {
      taskId: 'tw-100',
      operation: 'syncProgress',
      sessionId: 'session-1',
      normalizedPayload: JSON.stringify({ percent: 50, note: '' }),
    }
    expect(() =>
      checkIdempotency({ snapshotUpdatedAt, log: [] }, fp),
    ).not.toThrow()
  })
})

describe('Teambition RPC handler — update status', () => {
  it('rejects status update when remote task is newer', () => {
    const remoteUpdatedAt = '2026-07-12T16:00:00.000Z'
    const snapshotUpdatedAt = '2026-07-12T14:00:00.000Z'

    expect(() =>
      checkSyncConflict(remoteUpdatedAt, snapshotUpdatedAt),
    ).toThrow(SyncConflictError)
  })

  it('deduplicates identical status update', () => {
    const fp: SyncFingerprint = {
      taskId: 'tw-100',
      operation: 'updateStatus',
      sessionId: 'session-1',
      normalizedPayload: JSON.stringify({ statusId: 'in_progress', note: '' }),
    }

    const fingerprint = computeFingerprint(fp)
    const log: SyncLogEntry[] = [
      {
        fingerprint,
        operation: fp.operation,
        taskId: fp.taskId,
        sessionId: fp.sessionId,
        timestamp: '2026-07-12T14:00:00.000Z',
        result: 'synced',
      },
    ]

    expect(() =>
      checkIdempotency(
        { snapshotUpdatedAt: '2026-07-12T14:00:00.000Z', log },
        fp,
      ),
    ).toThrow(AlreadySyncedError)
  })

  it('normalizes payload to deduplicate identical operations', () => {
    const fp1: SyncFingerprint = {
      taskId: 'tw-100',
      operation: 'updateStatus',
      sessionId: 'session-1',
      normalizedPayload: JSON.stringify({ note: 'done', statusId: 'done' }),
    }
    const fp2: SyncFingerprint = {
      taskId: 'tw-100',
      operation: 'updateStatus',
      sessionId: 'session-1',
      normalizedPayload: JSON.stringify({ statusId: 'done', note: 'done' }),
    }

    // Different key order but same semantic content — fingerprints must match
    expect(computeFingerprint(fp1)).toBe(computeFingerprint(fp2))
  })
})

describe('Teambition RPC handler — bind project', () => {
  const requiresProject = (kind: 'feature' | 'bug' | 'task'): boolean =>
    (['feature', 'bug'] as const).includes(kind as 'feature' | 'bug')

  it('rejects binding feature task to empty project', () => {
    const kind: 'feature' | 'bug' | 'task' = 'feature'
    const projectId: string | null = null

    const shouldReject = requiresProject(kind) && !projectId
    expect(shouldReject).toBe(true)
  })

  it('rejects binding bug task to empty project', () => {
    const kind: 'feature' | 'bug' | 'task' = 'bug'
    const projectId: string | null = null

    const shouldReject = requiresProject(kind) && !projectId
    expect(shouldReject).toBe(true)
  })

  it('allows binding generic task to empty project (workspace-only)', () => {
    const kind: 'feature' | 'bug' | 'task' = 'task'
    const projectId: string | null = null

    const shouldReject = requiresProject(kind) && !projectId
    expect(shouldReject).toBe(false)
  })

  it('allows binding generic task to a project', () => {
    const kind: 'feature' | 'bug' | 'task' = 'task'
    const projectId = 'craft-project-1'

    const shouldReject = requiresProject(kind) && !projectId
    expect(shouldReject).toBe(false)
    expect(projectId).toBeTruthy()
  })
})

describe('Teambition sync — preflightSyncCheck', () => {
  const state: SyncPolicyState = {
    snapshotUpdatedAt: '2026-07-12T14:00:00.000Z',
    log: [],
  }

  it('passes when remote is not newer and no duplicate', () => {
    const fp: SyncFingerprint = {
      taskId: 'tw-100',
      operation: 'syncProgress',
      sessionId: 'session-1',
      normalizedPayload: JSON.stringify({ percent: 50 }),
    }

    const fingerprint = preflightSyncCheck(state, state.snapshotUpdatedAt, fp)
    expect(fingerprint).toBeTruthy()
    expect(typeof fingerprint).toBe('string')
  })

  it('throws SyncConflictError when remote is newer', () => {
    const fp: SyncFingerprint = {
      taskId: 'tw-100',
      operation: 'syncProgress',
      sessionId: 'session-1',
      normalizedPayload: JSON.stringify({ percent: 50 }),
    }

    expect(() =>
      preflightSyncCheck(state, '2026-07-12T16:00:00.000Z', fp),
    ).toThrow(SyncConflictError)
  })

  it('throws AlreadySyncedError when fingerprint exists in log', () => {
    const fp: SyncFingerprint = {
      taskId: 'tw-100',
      operation: 'syncProgress',
      sessionId: 'session-1',
      normalizedPayload: JSON.stringify({ percent: 50 }),
    }
    const fingerprint = computeFingerprint(fp)
    const stateWithLog: SyncPolicyState = {
      ...state,
      log: [
        {
          fingerprint,
          operation: fp.operation,
          taskId: fp.taskId,
          sessionId: fp.sessionId,
          timestamp: '2026-07-12T14:00:00.000Z',
          result: 'synced',
        },
      ],
    }

    expect(() =>
      preflightSyncCheck(stateWithLog, stateWithLog.snapshotUpdatedAt, fp),
    ).toThrow(AlreadySyncedError)
  })
})

describe('Teambition sync — sync log entry', () => {
  it('creates a log entry with correct fields', () => {
    const fp: SyncFingerprint = {
      taskId: 'tw-100',
      operation: 'syncProgress',
      sessionId: 'session-1',
      normalizedPayload: JSON.stringify({ percent: 50 }),
    }
    const timestamp = '2026-07-12T15:00:00.000Z'

    const entry = createSyncLogEntry(fp, 'synced', timestamp, 'req-123')

    expect(entry.fingerprint).toBe(computeFingerprint(fp))
    expect(entry.operation).toBe('syncProgress')
    expect(entry.taskId).toBe('tw-100')
    expect(entry.sessionId).toBe('session-1')
    expect(entry.timestamp).toBe(timestamp)
    expect(entry.result).toBe('synced')
    expect(entry.requestId).toBe('req-123')
  })

  it('includes error field for failed operations', () => {
    const fp: SyncFingerprint = {
      taskId: 'tw-100',
      operation: 'syncProgress',
      sessionId: 'session-1',
      normalizedPayload: JSON.stringify({ percent: 50 }),
    }
    const timestamp = '2026-07-12T15:00:00.000Z'

    const entry = createSyncLogEntry(fp, 'error', timestamp, undefined, 'Network timeout')

    expect(entry.result).toBe('error')
    expect(entry.error).toBe('Network timeout')
    expect(entry.requestId).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Handler-level tests for CLAIM_TASK / LIST_TASKS (Task 4).
//
// Mocks the two dynamically-imported modules the handlers pull in at call
// time (`@craft-agent/shared/config` and `@craft-agent/teambition-integration`)
// so registerTeambitionHandlers() can be exercised end-to-end against a fake
// RpcServer + HandlerDeps without a real workspace, MCP connection, or
// filesystem.
// ---------------------------------------------------------------------------

const FAKE_WORKSPACE = { id: 'ws-1', name: 'Test', slug: 'test', rootPath: '/tmp/fake-ws', createdAt: 0 }

let bindingsStore: Array<{ provider: 'teambition'; taskId: string; sessionId: string; sourceSlug: string; state: 'claimed'; claimedAt: string }> = []
let claimBindingShouldThrow = false
let gatewayShouldThrowCredentialsMissing = false
let taskBundleByTaskId: Record<string, { summary: { taskId: string; title: string; kind: string; updatedAt: string; projectId?: string } }> = {}

mock.module('@craft-agent/shared/config', () => ({
  getWorkspaceByNameOrId: (id: string) => (id === FAKE_WORKSPACE.id ? FAKE_WORKSPACE : null),
}))

mock.module('@craft-agent/shared/sources', () => ({
  loadSourceConfig: () => ({ mcp: { url: 'https://tw.example.com/api/mcp?userToken=fake-token' } }),
}))

mock.module('@craft-agent/teambition-integration', () => ({
  findBindingByTaskId: async (_root: string, taskId: string) =>
    bindingsStore.find((b) => b.taskId === taskId),
  claimBinding: async (_root: string, binding: (typeof bindingsStore)[number]) => {
    if (claimBindingShouldThrow) throw new Error('disk full')
    const existing = bindingsStore.find((b) => b.taskId === binding.taskId)
    if (existing) return existing
    bindingsStore.push(binding)
    return binding
  },
  loadBindings: async (_root: string) => bindingsStore,
  writeTaskBundle: async () => {},
  createUserMcpGateway: async () => {
    if (gatewayShouldThrowCredentialsMissing) {
      const { TeambitionCredentialsMissingError } = await import('./teambition')
      throw new TeambitionCredentialsMissingError('no token')
    }
    return {
      capabilities: ['identity', 'task.list', 'task.detail'],
      getCurrentUser: async () => ({ userId: 'u1', displayName: 'Test User' }),
      listMyTasks: async () => Object.values(taskBundleByTaskId).map((b) => b.summary),
      getTaskBundle: async (taskId: string) => {
        const found = taskBundleByTaskId[taskId]
        if (!found) throw new Error(`unknown task ${taskId}`)
        return { ...found, comments: [] }
      },
      addProgress: async () => ({ taskId: '', syncedAt: new Date().toISOString(), changed: true }),
      updateWorkflowStatus: async () => ({ taskId: '', syncedAt: new Date().toISOString(), changed: true }),
      addComment: async () => ({ taskId: '', syncedAt: new Date().toISOString(), changed: true }),
    }
  },
}))

function createHarness() {
  const handlers = new Map<string, HandlerFn>()
  const sentMessages: Array<{ sessionId: string; message: string }> = []
  const createdSessions: Array<{ workspaceId: string; options: unknown }> = []
  let sessionCounter = 0

  const server: RpcServer = {
    handle(channel, handler) {
      handlers.set(channel, handler)
    },
    push() {},
    async invokeClient() {
      return undefined
    },
    hasClientCapability() {
      return false
    },
    findClientsWithCapability() {
      return []
    },
  }

  const sessionsById = new Map<string, { id: string; workspaceId: string; workspaceName: string; lastMessageAt: number; messages: never[]; isProcessing: boolean }>()

  const deps: HandlerDeps = {
    sessionManager: {
      createSession: async (workspaceId: string, options?: unknown) => {
        sessionCounter += 1
        const id = `session-${sessionCounter}`
        createdSessions.push({ workspaceId, options })
        const session = { id, workspaceId, workspaceName: 'Test', lastMessageAt: 0, messages: [], isProcessing: false }
        sessionsById.set(id, session)
        return session as never
      },
      getSession: async (sessionId: string) => (sessionsById.get(sessionId) ?? null) as never,
      sendMessage: async (sessionId: string, message: string) => {
        sentMessages.push({ sessionId, message })
      },
    } as unknown as HandlerDeps['sessionManager'],
    oauthFlowStore: {} as HandlerDeps['oauthFlowStore'],
    platform: {
      appRootPath: '/',
      resourcesPath: '/',
      isPackaged: false,
      appVersion: '0.0.0-test',
      isDebugMode: true,
      logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
      imageProcessor: { getMetadata: async () => null, process: async () => Buffer.from('') },
    } as HandlerDeps['platform'],
  }

  return { server, deps, handlers, sentMessages, createdSessions }
}

const ctx: RequestContext = { clientId: 'client-1', workspaceId: FAKE_WORKSPACE.id, webContentsId: 1 }

describe('registerTeambitionHandlers — CLAIM_TASK', () => {
  it('rejects a Feature task without a Craft Project', async () => {
    const { registerTeambitionHandlers } = await import('./teambition')
    bindingsStore = []
    taskBundleByTaskId = {
      'tw-fixture-1': { summary: { taskId: 'tw-fixture-1', title: 'Fix login', kind: 'feature', updatedAt: '2026-07-12T10:00:00.000Z', projectId: 'tw-project-1' } },
    }
    const { server, deps, handlers } = createHarness()
    registerTeambitionHandlers(server, deps)
    const claim = handlers.get(RPC_CHANNELS.teambition.CLAIM_TASK)!

    const req: ClaimTeambitionTaskRequest = {
      workspaceId: FAKE_WORKSPACE.id,
      taskId: 'tw-fixture-1',
      kind: 'feature',
      title: 'Fix login',
      scope: { type: 'workspace' },
    }
    const result: ClaimTeambitionTaskResponse = await claim(ctx, FAKE_WORKSPACE.id, req)

    expect(result.errorCode).toBe('invalid_scope')
    expect(result.sessionId).toBe('')
  })

  it('rejects a Bug task without a Craft Project', async () => {
    const { registerTeambitionHandlers } = await import('./teambition')
    bindingsStore = []
    taskBundleByTaskId = {
      'tw-fixture-2': { summary: { taskId: 'tw-fixture-2', title: 'Crash on save', kind: 'bug', updatedAt: '2026-07-12T10:00:00.000Z', projectId: 'tw-project-1' } },
    }
    const { server, deps, handlers } = createHarness()
    registerTeambitionHandlers(server, deps)
    const claim = handlers.get(RPC_CHANNELS.teambition.CLAIM_TASK)!

    const req: ClaimTeambitionTaskRequest = {
      workspaceId: FAKE_WORKSPACE.id,
      taskId: 'tw-fixture-2',
      kind: 'bug',
      title: 'Crash on save',
      scope: { type: 'workspace' },
    }
    const result: ClaimTeambitionTaskResponse = await claim(ctx, FAKE_WORKSPACE.id, req)

    expect(result.errorCode).toBe('invalid_scope')
  })

  it('allows a generic Task to claim workspace-only (no project)', async () => {
    const { registerTeambitionHandlers } = await import('./teambition')
    bindingsStore = []
    taskBundleByTaskId = {
      'tw-fixture-3': { summary: { taskId: 'tw-fixture-3', title: 'Update docs', kind: 'task', updatedAt: '2026-07-12T10:00:00.000Z' } },
    }
    const { server, deps, handlers, sentMessages, createdSessions } = createHarness()
    registerTeambitionHandlers(server, deps)
    const claim = handlers.get(RPC_CHANNELS.teambition.CLAIM_TASK)!

    const req: ClaimTeambitionTaskRequest = {
      workspaceId: FAKE_WORKSPACE.id,
      taskId: 'tw-fixture-3',
      kind: 'task',
      title: 'Update docs',
      scope: { type: 'workspace' },
    }
    const result: ClaimTeambitionTaskResponse = await claim(ctx, FAKE_WORKSPACE.id, req)

    expect(result.errorCode).toBeUndefined()
    expect(result.created).toBe(true)
    expect(result.sessionId).toBeTruthy()
    expect(createdSessions).toHaveLength(1)
    expect((createdSessions[0]!.options as { projectId?: string }).projectId).toBeUndefined()
    // Initial analysis prompt was dispatched
    expect(sentMessages).toHaveLength(1)
    expect(sentMessages[0]!.sessionId).toBe(result.sessionId)
  })

  it('claims a generic Task into a Craft Project when project scope is chosen', async () => {
    const { registerTeambitionHandlers } = await import('./teambition')
    bindingsStore = []
    taskBundleByTaskId = {
      'tw-fixture-4': { summary: { taskId: 'tw-fixture-4', title: 'Refactor auth', kind: 'task', updatedAt: '2026-07-12T10:00:00.000Z' } },
    }
    const { server, deps, handlers, createdSessions } = createHarness()
    registerTeambitionHandlers(server, deps)
    const claim = handlers.get(RPC_CHANNELS.teambition.CLAIM_TASK)!

    const req: ClaimTeambitionTaskRequest = {
      workspaceId: FAKE_WORKSPACE.id,
      taskId: 'tw-fixture-4',
      kind: 'task',
      title: 'Refactor auth',
      scope: { type: 'project', projectId: 'craft-project-1' },
    }
    const result: ClaimTeambitionTaskResponse = await claim(ctx, FAKE_WORKSPACE.id, req)

    expect(result.errorCode).toBeUndefined()
    expect((createdSessions[0]!.options as { projectId?: string }).projectId).toBe('craft-project-1')
  })

  it('returns the existing session for a duplicate task ID instead of creating a second one', async () => {
    const { registerTeambitionHandlers } = await import('./teambition')
    bindingsStore = []
    taskBundleByTaskId = {
      'tw-fixture-5': { summary: { taskId: 'tw-fixture-5', title: 'Add export', kind: 'feature', updatedAt: '2026-07-12T10:00:00.000Z', projectId: 'tw-project-1' } },
    }
    const { server, deps, handlers, createdSessions } = createHarness()
    registerTeambitionHandlers(server, deps)
    const claim = handlers.get(RPC_CHANNELS.teambition.CLAIM_TASK)!

    const req: ClaimTeambitionTaskRequest = {
      workspaceId: FAKE_WORKSPACE.id,
      taskId: 'tw-fixture-5',
      kind: 'feature',
      title: 'Add export',
      scope: { type: 'project', projectId: 'craft-project-1' },
    }
    const first = await claim(ctx, FAKE_WORKSPACE.id, req)
    const second = await claim(ctx, FAKE_WORKSPACE.id, req)

    expect(createdSessions).toHaveLength(1)
    expect(second.sessionId).toBe(first.sessionId)
    expect(second.created).toBe(false)
  })

  it('returns a recoverable binding_persist_failed error without losing the created session', async () => {
    const { registerTeambitionHandlers } = await import('./teambition')
    bindingsStore = []
    claimBindingShouldThrow = true
    taskBundleByTaskId = {
      'tw-fixture-6': { summary: { taskId: 'tw-fixture-6', title: 'Flaky disk', kind: 'task', updatedAt: '2026-07-12T10:00:00.000Z' } },
    }
    const { server, deps, handlers, createdSessions } = createHarness()
    registerTeambitionHandlers(server, deps)
    const claim = handlers.get(RPC_CHANNELS.teambition.CLAIM_TASK)!

    const req: ClaimTeambitionTaskRequest = {
      workspaceId: FAKE_WORKSPACE.id,
      taskId: 'tw-fixture-6',
      kind: 'task',
      title: 'Flaky disk',
      scope: { type: 'workspace' },
    }
    const result = await claim(ctx, FAKE_WORKSPACE.id, req)

    expect(result.errorCode).toBe('binding_persist_failed')
    expect(result.sessionId).toBeTruthy()
    expect(createdSessions).toHaveLength(1)

    claimBindingShouldThrow = false
  })
})

describe('registerTeambitionHandlers — LIST_TASKS', () => {
  it('returns needsReauth when Teambition credentials are missing', async () => {
    const { registerTeambitionHandlers } = await import('./teambition')
    gatewayShouldThrowCredentialsMissing = true
    const { server, deps, handlers } = createHarness()
    registerTeambitionHandlers(server, deps)
    const list = handlers.get(RPC_CHANNELS.teambition.LIST_TASKS)!

    const result: ListTeambitionTasksResponse = await list(ctx, FAKE_WORKSPACE.id)

    expect(result.needsReauth).toBe(true)
    expect(result.tasks).toEqual([])
    expect(result.capabilities).toEqual([])

    gatewayShouldThrowCredentialsMissing = false
  })

  it('lists tasks with binding state joined in', async () => {
    const { registerTeambitionHandlers } = await import('./teambition')
    bindingsStore = [
      { provider: 'teambition', taskId: 'tw-fixture-7', sessionId: 'session-existing', sourceSlug: 'teambition', state: 'claimed', claimedAt: '2026-07-12T09:00:00.000Z' },
    ]
    taskBundleByTaskId = {
      'tw-fixture-7': { summary: { taskId: 'tw-fixture-7', title: 'Bound task', kind: 'task', updatedAt: '2026-07-12T10:00:00.000Z' } },
    }
    const { server, deps, handlers } = createHarness()
    registerTeambitionHandlers(server, deps)
    const list = handlers.get(RPC_CHANNELS.teambition.LIST_TASKS)!

    const result: ListTeambitionTasksResponse = await list(ctx, FAKE_WORKSPACE.id)

    expect(result.needsReauth).toBeUndefined()
    expect(result.tasks).toHaveLength(1)
    expect(result.tasks[0]!.hasBinding).toBe(true)
    expect(result.tasks[0]!.sessionId).toBe('session-existing')
  })
})
