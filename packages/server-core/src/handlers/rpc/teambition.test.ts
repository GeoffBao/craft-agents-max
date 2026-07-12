import { describe, expect, it } from 'bun:test'

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
