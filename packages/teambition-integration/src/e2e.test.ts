/**
 * End-to-end offline verification of the Teambition task handoff flow.
 *
 * This test drives the same sequence a real claim → session → sync flow
 * would perform (list → claim → duplicate claim → sync progress → stale
 * update), but against a `FakeTeambitionGateway` and the real storage /
 * sync-policy modules. No network access, no real MCP server, no real
 * credentials — only redacted fixtures under `./fixtures`.
 */
import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type {
  ExternalTaskBundle,
  ExternalTaskSummary,
  ListMyTasksInput,
  ProgressInput,
  SyncResult,
  TeambitionUser,
  WorkflowStatusInput,
} from './domain'
import type { TeambitionCapability, TeambitionGateway } from './gateway'
import { claimBinding, findBindingByTaskId, loadBindings } from './bindings'
import { writeTaskBundle, appendSyncLog } from './task-bundle'
import {
  AlreadySyncedError,
  SyncConflictError,
  createSyncLogEntry,
  preflightSyncCheck,
  type SyncPolicyState,
} from './sync-policy'
import fixtureBundle from './fixtures/redacted-task-bundle.json'

/* ------------------------------------------------------------------ */
/*  Fixture constants                                                  */
/* ------------------------------------------------------------------ */

const TASK_ID = 'tw-fixture-100'
const PROJECT_ID = 'tw-project-1'
const CRAFT_PROJECT_ID = 'craft-project-1'
const SESSION_ID = 'session-fixture-1'

/* ------------------------------------------------------------------ */
/*  FakeTeambitionGateway                                              */
/* ------------------------------------------------------------------ */

/**
 * A fully in-memory TeambitionGateway used for offline verification.
 * `remoteUpdatedAt` can be advanced by the test to simulate a stale
 * snapshot and trigger a conflict on the next write.
 */
class FakeTeambitionGateway implements TeambitionGateway {
  readonly capabilities: readonly TeambitionCapability[] = [
    'identity',
    'task.list',
    'task.detail',
    'task.progress.read',
    'task.progress.write',
    'task.status.write',
    'task.comment.write',
  ]

  remoteUpdatedAt: string
  addProgressCallCount = 0
  updateStatusCallCount = 0

  constructor(private readonly bundle: ExternalTaskBundle) {
    this.remoteUpdatedAt = bundle.summary.updatedAt
  }

  async getCurrentUser(): Promise<TeambitionUser> {
    return { userId: 'fixture-user-1', displayName: 'Fixture User' }
  }

  async listMyTasks(_input: ListMyTasksInput): Promise<ExternalTaskSummary[]> {
    return [{ ...this.bundle.summary, updatedAt: this.remoteUpdatedAt }]
  }

  async getTaskBundle(taskId: string): Promise<ExternalTaskBundle> {
    if (taskId !== this.bundle.summary.taskId) {
      throw new Error(`Unknown fixture task: ${taskId}`)
    }
    return {
      ...this.bundle,
      summary: { ...this.bundle.summary, updatedAt: this.remoteUpdatedAt },
    }
  }

  async addProgress(taskId: string, input: ProgressInput): Promise<SyncResult> {
    this.addProgressCallCount += 1
    const syncedAt = new Date().toISOString()
    this.remoteUpdatedAt = syncedAt
    return { taskId, syncedAt, changed: true, message: `progress=${input.percent}` }
  }

  async updateWorkflowStatus(taskId: string, _input: WorkflowStatusInput): Promise<SyncResult> {
    this.updateStatusCallCount += 1
    const syncedAt = new Date().toISOString()
    this.remoteUpdatedAt = syncedAt
    return { taskId, syncedAt, changed: true }
  }

  async addComment(taskId: string, _content: string): Promise<SyncResult> {
    return { taskId, syncedAt: new Date().toISOString(), changed: true }
  }
}

/* ------------------------------------------------------------------ */
/*  Test-local "claim" helper mirroring the RPC CLAIM_TASK handler     */
/* ------------------------------------------------------------------ */

interface ClaimResult {
  sessionId: string
  taskId: string
  created: boolean
}

async function claimTask(
  workspaceRoot: string,
  gateway: FakeTeambitionGateway,
  taskId: string,
  craftProjectId: string,
): Promise<ClaimResult> {
  const existing = await findBindingByTaskId(workspaceRoot, taskId)
  if (existing) {
    return { sessionId: existing.sessionId, taskId, created: false }
  }

  const bundle = await gateway.getTaskBundle(taskId)
  if ((bundle.summary.kind === 'feature' || bundle.summary.kind === 'bug') && !craftProjectId) {
    throw new Error(`Cannot claim ${bundle.summary.kind} task without a Craft Project`)
  }

  // In the real handler this comes from SessionManager.createSession(); the
  // fixture session ID stands in for that call in this offline test.
  const sessionId = SESSION_ID

  await writeTaskBundle(workspaceRoot, sessionId, bundle)
  await claimBinding(workspaceRoot, {
    provider: 'teambition',
    taskId,
    sessionId,
    sourceSlug: 'teambition',
    state: 'claimed',
    claimedAt: bundle.summary.updatedAt,
  })

  return { sessionId, taskId, created: true }
}

/* ------------------------------------------------------------------ */
/*  Test-local "sync progress" helper mirroring the RPC SYNC_PROGRESS   */
/*  handler, including the preflight conflict + idempotency check.     */
/* ------------------------------------------------------------------ */

async function syncProgress(
  workspaceRoot: string,
  gateway: FakeTeambitionGateway,
  taskId: string,
  sessionId: string,
  snapshotUpdatedAt: string,
  percent: number,
): Promise<'synced' | 'conflict' | 'already_synced'> {
  const bundle = await gateway.getTaskBundle(taskId)
  const remoteUpdatedAt = bundle.summary.updatedAt

  const fp = {
    taskId,
    operation: 'syncProgress',
    sessionId,
    normalizedPayload: JSON.stringify({ percent }),
  }
  const state: SyncPolicyState = { snapshotUpdatedAt, log: [] }

  try {
    preflightSyncCheck(state, remoteUpdatedAt, fp)
  } catch (err) {
    if (err instanceof SyncConflictError) {
      await appendSyncLog(workspaceRoot, {
        ...createSyncLogEntry(fp, 'conflict', new Date().toISOString(), undefined, err.message),
      })
      return 'conflict'
    }
    if (err instanceof AlreadySyncedError) {
      return 'already_synced'
    }
    throw err
  }

  await gateway.addProgress(taskId, { percent })
  await appendSyncLog(workspaceRoot, createSyncLogEntry(fp, 'synced', new Date().toISOString()))
  return 'synced'
}

/* ------------------------------------------------------------------ */
/*  Test suite                                                         */
/* ------------------------------------------------------------------ */

describe('Teambition task handoff — end-to-end (offline, fixture-backed)', () => {
  const roots: string[] = []

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('lists, claims (idempotently), syncs progress, and rejects a stale sync', async () => {
    const root = mkdtempSync(join(tmpdir(), 'teambition-e2e-'))
    roots.push(root)

    const gateway = new FakeTeambitionGateway(fixtureBundle as ExternalTaskBundle)

    // -----------------------------------------------------------------
    // Step: list tasks
    // -----------------------------------------------------------------
    const tasks = await gateway.listMyTasks({})
    expect(tasks).toHaveLength(1)
    expect(tasks[0]).toMatchObject({
      taskId: TASK_ID,
      kind: 'bug',
      projectId: PROJECT_ID,
    })

    // -----------------------------------------------------------------
    // Step: claim the Bug task into craft-project-1
    // -----------------------------------------------------------------
    const firstClaim = await claimTask(root, gateway, TASK_ID, CRAFT_PROJECT_ID)
    expect(firstClaim.created).toBe(true)
    expect(firstClaim.sessionId).toBe(SESSION_ID)

    // -----------------------------------------------------------------
    // Step: claim again — must reuse the same binding/session
    // -----------------------------------------------------------------
    const secondClaim = await claimTask(root, gateway, TASK_ID, CRAFT_PROJECT_ID)
    expect(secondClaim.created).toBe(false)
    expect(secondClaim.sessionId).toBe(firstClaim.sessionId)

    const bindings = await loadBindings(root)
    expect(bindings).toHaveLength(1)
    expect(bindings[0]?.taskId).toBe(TASK_ID)
    expect(bindings[0]?.sessionId).toBe(SESSION_ID)

    // -----------------------------------------------------------------
    // Step: sync progress — should succeed against the current snapshot
    // -----------------------------------------------------------------
    const binding = await findBindingByTaskId(root, TASK_ID)
    expect(binding).toBeDefined()

    const syncResult = await syncProgress(
      root,
      gateway,
      TASK_ID,
      binding!.sessionId,
      binding!.claimedAt,
      50,
    )
    expect(syncResult).toBe('synced')
    expect(gateway.addProgressCallCount).toBe(1)

    // -----------------------------------------------------------------
    // Step: attempt a stale update — simulate the remote task having
    // moved on (e.g. another user updated it) after our snapshot was
    // taken. The conflict check must reject it WITHOUT calling addProgress.
    // -----------------------------------------------------------------
    const staleSnapshot = '2020-01-01T00:00:00.000Z' // long before remoteUpdatedAt
    const callsBeforeStaleAttempt = gateway.addProgressCallCount

    const staleResult = await syncProgress(
      root,
      gateway,
      TASK_ID,
      binding!.sessionId,
      staleSnapshot,
      75,
    )

    expect(staleResult).toBe('conflict')
    expect(gateway.addProgressCallCount).toBe(callsBeforeStaleAttempt) // unchanged — no write happened

    // -----------------------------------------------------------------
    // Final assertions: exactly one binding, one session, one successful
    // sync, one rejected conflict.
    // -----------------------------------------------------------------
    const finalBindings = await loadBindings(root)
    expect(finalBindings).toHaveLength(1)
    expect(gateway.addProgressCallCount).toBe(1)
  })
})
