import { describe, expect, it, beforeEach } from 'bun:test'
import {
  checkSyncConflict,
  checkIdempotency,
  computeFingerprint,
  SyncConflictError,
  AlreadySyncedError,
  type SyncFingerprint,
  type SyncLogEntry,
  type SyncPolicyState,
} from './sync-policy'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW = '2026-07-12T15:00:00.000Z'
const EARLIER = '2026-07-12T14:00:00.000Z'
const LATER = '2026-07-12T16:00:00.000Z'

function freshLog(): SyncLogEntry[] {
  return []
}

function freshState(overrides?: Partial<SyncPolicyState>): SyncPolicyState {
  return {
    snapshotUpdatedAt: EARLIER,
    log: freshLog(),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// conflict detection
// ---------------------------------------------------------------------------

describe('checkSyncConflict', () => {
  it('allows sync when remote task is older than local snapshot', () => {
    expect(() =>
      checkSyncConflict(EARLIER, LATER),
    ).not.toThrow()
  })

  it('allows sync when remote task has same updatedAt as local snapshot', () => {
    expect(() =>
      checkSyncConflict(EARLIER, EARLIER),
    ).not.toThrow()
  })

  it('rejects sync when remote task is newer than local snapshot (conflict)', () => {
    expect(() =>
      checkSyncConflict(LATER, EARLIER),
    ).toThrow(SyncConflictError)
  })

  it('rejects sync when remote timestamp is missing (refuse unsafe)', () => {
    expect(() =>
      checkSyncConflict('', EARLIER),
    ).toThrow(SyncConflictError)
  })

  it('rejects sync when local snapshot timestamp is missing', () => {
    expect(() =>
      checkSyncConflict(EARLIER, ''),
    ).toThrow(SyncConflictError)
  })
})

// ---------------------------------------------------------------------------
// fingerprint computation
// ---------------------------------------------------------------------------

describe('computeFingerprint', () => {
  it('produces a deterministic fingerprint from taskId + operation + sessionId + normalized payload', () => {
    const fp1 = computeFingerprint({
      taskId: 'tw-100',
      operation: 'syncProgress',
      sessionId: 'session-1',
      normalizedPayload: JSON.stringify({ percent: 50 }),
    })
    const fp2 = computeFingerprint({
      taskId: 'tw-100',
      operation: 'syncProgress',
      sessionId: 'session-1',
      normalizedPayload: JSON.stringify({ percent: 50 }),
    })
    expect(fp1).toBe(fp2)
  })

  it('produces different fingerprints for different operations', () => {
    const fp1 = computeFingerprint({
      taskId: 'tw-100',
      operation: 'syncProgress',
      sessionId: 'session-1',
      normalizedPayload: JSON.stringify({ percent: 50 }),
    })
    const fp2 = computeFingerprint({
      taskId: 'tw-100',
      operation: 'updateStatus',
      sessionId: 'session-1',
      normalizedPayload: JSON.stringify({ status: 'in_progress' }),
    })
    expect(fp1).not.toBe(fp2)
  })

  it('produces different fingerprints for different sessions', () => {
    const fp1 = computeFingerprint({
      taskId: 'tw-100',
      operation: 'syncProgress',
      sessionId: 'session-1',
      normalizedPayload: JSON.stringify({ percent: 50 }),
    })
    const fp2 = computeFingerprint({
      taskId: 'tw-100',
      operation: 'syncProgress',
      sessionId: 'session-2',
      normalizedPayload: JSON.stringify({ percent: 50 }),
    })
    expect(fp1).not.toBe(fp2)
  })

  it('treats payload with different property order as identical (normalized)', () => {
    const fp1 = computeFingerprint({
      taskId: 'tw-100',
      operation: 'syncProgress',
      sessionId: 'session-1',
      normalizedPayload: JSON.stringify({ percent: 50, note: 'ok' }),
    })
    const fp2 = computeFingerprint({
      taskId: 'tw-100',
      operation: 'syncProgress',
      sessionId: 'session-1',
      normalizedPayload: JSON.stringify({ note: 'ok', percent: 50 }),
    })
    // Both payloads have the same sorted-JSON representation
    // Normalization should sort keys
    expect(fp1).toBe(fp2)
  })
})

// ---------------------------------------------------------------------------
// idempotency guard
// ---------------------------------------------------------------------------

describe('checkIdempotency', () => {
  it('passes when the fingerprint is not in the log', () => {
    const state = freshState()
    const fp: SyncFingerprint = {
      taskId: 'tw-100',
      operation: 'syncProgress',
      sessionId: 'session-1',
      normalizedPayload: JSON.stringify({ percent: 50 }),
    }
    expect(() => checkIdempotency(state, fp)).not.toThrow()
  })

  it('throws AlreadySyncedError when an identical fingerprint exists', () => {
    const fp: SyncFingerprint = {
      taskId: 'tw-100',
      operation: 'syncProgress',
      sessionId: 'session-1',
      normalizedPayload: JSON.stringify({ percent: 50 }),
    }
    const state = freshState({
      log: [
        {
          fingerprint: computeFingerprint(fp),
          operation: fp.operation,
          taskId: fp.taskId,
          sessionId: fp.sessionId,
          timestamp: EARLIER,
          result: 'synced',
        },
      ],
    })
    expect(() => checkIdempotency(state, fp)).toThrow(AlreadySyncedError)
  })

  it('ignores different operations for the same task (does not dedupe across operations)', () => {
    const state = freshState({
      log: [
        {
          fingerprint: computeFingerprint({
            taskId: 'tw-100',
            operation: 'syncProgress',
            sessionId: 'session-1',
            normalizedPayload: JSON.stringify({ percent: 30 }),
          }),
          operation: 'syncProgress',
          taskId: 'tw-100',
          sessionId: 'session-1',
          timestamp: EARLIER,
          result: 'synced',
        },
      ],
    })
    const fp: SyncFingerprint = {
      taskId: 'tw-100',
      operation: 'updateStatus',
      sessionId: 'session-1',
      normalizedPayload: JSON.stringify({ status: 'in_progress' }),
    }
    // Different operation — should NOT be deduped
    expect(() => checkIdempotency(state, fp)).not.toThrow()
  })

  it('does not dedupe the same operation with different payload', () => {
    const state = freshState({
      log: [
        {
          fingerprint: computeFingerprint({
            taskId: 'tw-100',
            operation: 'syncProgress',
            sessionId: 'session-1',
            normalizedPayload: JSON.stringify({ percent: 50 }),
          }),
          operation: 'syncProgress',
          taskId: 'tw-100',
          sessionId: 'session-1',
          timestamp: EARLIER,
          result: 'synced',
        },
      ],
    })
    const fp: SyncFingerprint = {
      taskId: 'tw-100',
      operation: 'syncProgress',
      sessionId: 'session-1',
      normalizedPayload: JSON.stringify({ percent: 75 }),
    }
    // Different payload — should NOT be deduped
    expect(() => checkIdempotency(state, fp)).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// end-to-end: conflict + idempotency + log
// ---------------------------------------------------------------------------

describe('sync policy integration', () => {
  let state: SyncPolicyState

  beforeEach(() => {
    state = freshState({ snapshotUpdatedAt: EARLIER })
  })

  it('rejects stale update while accepting a fresh one', () => {
    // Remote task updated after our snapshot → conflict
    expect(() => checkSyncConflict(LATER, state.snapshotUpdatedAt)).toThrow(SyncConflictError)

    // Remote task updated before our snapshot → ok
    expect(() => checkSyncConflict(EARLIER, state.snapshotUpdatedAt)).not.toThrow()
  })

  it('records a successful sync fingerprint in the log after a pass', () => {
    const fp: SyncFingerprint = {
      taskId: 'tw-100',
      operation: 'syncProgress',
      sessionId: 'session-1',
      normalizedPayload: JSON.stringify({ percent: 50, note: 'Working on it' }),
    }

    // No conflict
    checkSyncConflict(EARLIER, state.snapshotUpdatedAt)
    // Not already synced
    checkIdempotency(state, fp)

    // Simulate recording the log entry
    const fingerprint = computeFingerprint(fp)
    state.log.push({
      fingerprint,
      operation: fp.operation,
      taskId: fp.taskId,
      sessionId: fp.sessionId,
      timestamp: NOW,
      result: 'synced',
    })

    expect(state.log).toHaveLength(1)
    expect(state.log[0].result).toBe('synced')
    expect(state.log[0].fingerprint).toBe(fingerprint)
  })

  it('deduplicates a repeated identical sync attempt', () => {
    const fp: SyncFingerprint = {
      taskId: 'tw-100',
      operation: 'syncProgress',
      sessionId: 'session-1',
      normalizedPayload: JSON.stringify({ percent: 50 }),
    }

    // First sync
    checkSyncConflict(EARLIER, state.snapshotUpdatedAt)
    checkIdempotency(state, fp)
    const fingerprint = computeFingerprint(fp)
    state.log.push({
      fingerprint,
      operation: fp.operation,
      taskId: fp.taskId,
      sessionId: fp.sessionId,
      timestamp: NOW,
      result: 'synced',
    })

    // Second sync with same fingerprint → AlreadySynced
    expect(() => checkIdempotency(state, fp)).toThrow(AlreadySyncedError)

    // Log should still have only 1 entry
    expect(state.log).toHaveLength(1)
  })
})
