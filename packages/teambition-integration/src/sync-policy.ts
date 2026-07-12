/**
 * Sync-policy: conflict detection, idempotency guards, and sync logging
 * for Teambition ↔ Craft Agents bidirectional operations.
 */

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

/** A deterministic hash of a sync operation for deduplication. */
export interface SyncFingerprint {
  taskId: string
  operation: string
  sessionId: string
  /** Normalized (sorted-key) JSON of the operation payload. */
  normalizedPayload: string
}

/** One record in the append-only sync log. */
export interface SyncLogEntry {
  fingerprint: string
  operation: string
  taskId: string
  sessionId: string
  timestamp: string
  result: 'synced' | 'conflict' | 'already_synced' | 'error'
  requestId?: string
  error?: string
}

/** Aggregate sync state for a single Teambition task binding. */
export interface SyncPolicyState {
  /** ISO timestamp of the local snapshot (from ExternalTaskSummary.updatedAt). */
  snapshotUpdatedAt: string
  /** Append-only sync log for this session + task pair. */
  log: SyncLogEntry[]
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class SyncConflictError extends Error {
  readonly remoteUpdatedAt: string
  readonly snapshotUpdatedAt: string

  constructor(remoteUpdatedAt: string, snapshotUpdatedAt: string) {
    super(
      `Sync conflict: remote task was updated at ${remoteUpdatedAt}, ` +
        `but local snapshot is from ${snapshotUpdatedAt}. Refresh required.`,
    )
    this.name = 'SyncConflictError'
    this.remoteUpdatedAt = remoteUpdatedAt
    this.snapshotUpdatedAt = snapshotUpdatedAt
  }
}

export class AlreadySyncedError extends Error {
  readonly fingerprint: string

  constructor(fingerprint: string) {
    super(`Operation already synced (deduplicated): ${fingerprint}`)
    this.name = 'AlreadySyncedError'
    this.fingerprint = fingerprint
  }
}

// ---------------------------------------------------------------------------
// Conflict detection
// ---------------------------------------------------------------------------

/**
 * Compare remote task `updatedAt` against the local snapshot timestamp.
 * Throws `SyncConflictError` when remote is newer than local (stale snapshot),
 * or when either timestamp is missing (unsafe to proceed).
 */
export function checkSyncConflict(
  remoteUpdatedAt: string,
  snapshotUpdatedAt: string,
): void {
  if (!remoteUpdatedAt || !snapshotUpdatedAt) {
    throw new SyncConflictError(
      remoteUpdatedAt || '(missing)',
      snapshotUpdatedAt || '(missing)',
    )
  }
  if (remoteUpdatedAt > snapshotUpdatedAt) {
    throw new SyncConflictError(remoteUpdatedAt, snapshotUpdatedAt)
  }
}

// ---------------------------------------------------------------------------
// Fingerprint computation
// ---------------------------------------------------------------------------

/**
 * Compute a deterministic fingerprint for an operation.
 * Input payload JSON is normalized by sorting keys, so two payloads
 * with the same semantic content produce the same fingerprint.
 */
export function computeFingerprint(fp: SyncFingerprint): string {
  const normalized = normalizePayload(fp.normalizedPayload)
  const parts = [fp.taskId, fp.operation, fp.sessionId, normalized]
  // Simple FNV-1a-like hash for determinism without crypto dependency
  const input = parts.join('::')
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/**
 * Normalize a JSON payload string by parsing, sorting keys, and re-serializing.
 * Returns the original string if it's not valid JSON.
 */
function normalizePayload(json: string): string {
  try {
    const parsed = JSON.parse(json)
    return JSON.stringify(parsed, Object.keys(parsed).sort())
  } catch {
    return json
  }
}

// ---------------------------------------------------------------------------
// Idempotency guard
// ---------------------------------------------------------------------------

/**
 * Check whether an operation has already been synced by comparing its
 * fingerprint against the append-only sync log.
 * Throws `AlreadySyncedError` when an identical fingerprint exists.
 */
export function checkIdempotency(
  state: SyncPolicyState,
  fp: SyncFingerprint,
): void {
  const fingerprint = computeFingerprint(fp)
  const match = state.log.find((entry) => entry.fingerprint === fingerprint)
  if (match) {
    throw new AlreadySyncedError(fingerprint)
  }
}

// ---------------------------------------------------------------------------
// Combined check (for handler convenience)
// ---------------------------------------------------------------------------

/**
 * Run conflict check + idempotency check in sequence before a write.
 * Returns the computed fingerprint for later logging.
 * Throws SyncConflictError or AlreadySyncedError on failure.
 */
export function preflightSyncCheck(
  state: SyncPolicyState,
  remoteUpdatedAt: string,
  fp: SyncFingerprint,
): string {
  checkSyncConflict(remoteUpdatedAt, state.snapshotUpdatedAt)
  checkIdempotency(state, fp)
  return computeFingerprint(fp)
}

// ---------------------------------------------------------------------------
// Sync log entry factory
// ---------------------------------------------------------------------------

/**
 * Create a sync log entry for a completed operation.
 */
export function createSyncLogEntry(
  fp: SyncFingerprint,
  result: SyncLogEntry['result'],
  timestamp: string,
  requestId?: string,
  error?: string,
): SyncLogEntry {
  return {
    fingerprint: computeFingerprint(fp),
    operation: fp.operation,
    taskId: fp.taskId,
    sessionId: fp.sessionId,
    timestamp,
    result,
    ...(requestId ? { requestId } : {}),
    ...(error ? { error } : {}),
  }
}
