# Task 6 Report — Explicit Progress/Status Synchronization

**Completed:** 2026-07-12T22:50 CST  
**Tests:** 63 total (48 teambition-integration + 15 server-core) — ALL PASS

---

## Summary

Implemented explicit progress/status synchronization between Craft Agent sessions and
Teambition tasks. The sync system enforces three safety guarantees:

1. **Conflict detection**: remote `updatedAt` must not be newer than local snapshot
2. **Idempotency**: duplicate operation fingerprints are rejected
3. **Sync logging**: every operation is recorded with redacted content

Three new RPC operations are available: `teambition:syncProgress`,
`teambition:updateStatus`, and `teambition:bindProject`.

---

## 1. Sync Policy Module (`sync-policy.ts`)

### 1.1 Conflict Detection

```typescript
export function checkSyncConflict(remoteUpdatedAt: string, snapshotUpdatedAt: string): void
```

Throws `SyncConflictError` when:
- `remoteUpdatedAt > snapshotUpdatedAt` (remote was modified after our snapshot)
- Either timestamp is missing (unsafe to proceed)

### 1.2 Fingerprint Computation

```typescript
export function computeFingerprint(fp: SyncFingerprint): string
```

Generates a deterministic FNV-1a-like hash from `taskId::operation::sessionId::normalizedPayload`.
Payload is normalized by parsing JSON and sorting keys before re-serializing, so
`{a:1,b:2}` and `{b:2,a:1}` produce identical fingerprints.

### 1.3 Idempotency Guard

```typescript
export function checkIdempotency(state: SyncPolicyState, fp: SyncFingerprint): void
```

Throws `AlreadySyncedError` when an entry with the same fingerprint already exists in
the sync log. Different operations (e.g., `syncProgress` vs `updateStatus`) are NOT
deduplicated against each other, and different payloads for the same operation are also
allowed through.

### 1.4 Combined Preflight Check

```typescript
export function preflightSyncCheck(state, remoteUpdatedAt, fp): string
```

Runs conflict check + idempotency check in sequence. Returns the fingerprint for
subsequent logging on success, or throws on failure.

---

## 2. RPC Handler Implementation

### 2.1 Gateway Construction

The handler builds a `TeambitionGateway` from the workspace's teambition source config:

```typescript
async function getGateway(workspaceId: string) {
  const config = loadSourceConfig(workspace.rootPath, 'teambition')
  const endpoint = config.mcp.url.replace(/[?&]userToken=[^&]*/, '')
  return createUserMcpGateway({
    endpoint,
    getToken: async () => { /* re-read config each time */ },
  })
}
```

The raw token is extracted from the MCP URL at call time and never logged, persisted,
or included in error messages.

### 2.2 Sync Progress Handler

```
RPC: teambition:syncProgress
Request:  { workspaceId, taskId, sessionId, percent, note? }
Response: { result: 'synced'|'conflict'|'already_synced'|'error', message, syncedAt?, remoteUpdatedAt? }
```

Flow:
1. Verify task binding exists
2. Fetch current remote task metadata (for `updatedAt`)
3. Compute fingerprint from `{percent, note}`
4. Run preflightCheck (conflict + idempotency)
5. Call `gateway.addProgress(taskId, {percent, note})`
6. Append redacted sync log entry

### 2.3 Update Status Handler

```
RPC: teambition:updateStatus
Request:  { workspaceId, taskId, sessionId, statusId, note? }
Response: { result: 'synced'|'conflict'|'already_synced'|'error', message, syncedAt?, remoteUpdatedAt? }
```

Same flow as sync progress, but calls `gateway.updateWorkflowStatus()`.
The `statusId` must be a valid workflow status from the Teambition project —
the UI is responsible for presenting available statuses. The handler does NOT
translate local Kanban columns to remote statuses.

### 2.4 Bind Project Handler

```
RPC: teambition:bindProject
Request:  { workspaceId, taskId, sessionId, projectId }
Response: { result: 'bound'|'already_bound'|'error', message, sessionId }
```

Flow:
1. Verify task binding exists
2. Fetch task bundle to determine kind
3. For `feature`/`bug` tasks with empty `projectId`: reject with error
4. Call `sessionManager.setSessionProjectId(sessionId, projectId)`
5. Re-persist binding (idempotent)

---

## 3. UI Integration (TeambitionTaskActions)

Updated the component with:
- **New props**: `sessionId`, `workspaceId`, `onSyncStateChange`
- **Pending state**: shows "Syncing..." during async operations, disables menu items
- **Conflict state**: amber border + warning icon in trigger, "需要刷新" message in menu
- **Last message**: feedback line showing operation result
- **Actual RPC calls**: `window.electronAPI.syncTeambitionProgress()`,
  `window.electronAPI.updateTeambitionStatus()`,
  `window.electronAPI.bindTeambitionProject()`
- **Error handling**: network failures preserve local state and show "待同步" (pending)

---

## 4. Test Results

### teambition-integration tests (48 tests)

```datatable
{
  "columns": [
    { "key": "file", "label": "Test File", "type": "text" },
    { "key": "tests", "label": "Tests", "type": "number" },
    { "key": "result", "label": "Result", "type": "badge" }
  ],
  "rows": [
    { "file": "domain.test.ts", "tests": 10, "result": "pass" },
    { "file": "storage.test.ts", "tests": 1, "result": "pass" },
    { "file": "mcp-gateway.test.ts", "tests": 21, "result": "pass" },
    { "file": "sync-policy.test.ts", "tests": 16, "result": "pass" }
  ]
}
```

### server-core tests (15 tests)

```datatable
{
  "columns": [
    { "key": "suite", "label": "Test Suite", "type": "text" },
    { "key": "tests", "label": "Tests", "type": "number" },
    { "key": "result", "label": "Result", "type": "badge" }
  ],
  "rows": [
    { "suite": "sync progress", "tests": 3, "result": "pass" },
    { "suite": "update status", "tests": 3, "result": "pass" },
    { "suite": "bind project", "tests": 4, "result": "pass" },
    { "suite": "preflightSyncCheck", "tests": 3, "result": "pass" },
    { "suite": "sync log entry", "tests": 2, "result": "pass" }
  ]
}
```

### Full test output

```
bun test packages/teambition-integration/src/ packages/server-core/src/handlers/rpc/teambition.test.ts

63 pass, 0 fail, 160 expect() calls across 5 files
```

---

## 5. Key Design Decisions

1. **Standalone sync-policy module** — Pure functions, no I/O, no gateway dependency.
   Testable in complete isolation.

2. **FNV-1a-like hashing** — Simple deterministic hash without crypto dependency.
   Sufficient for deduplication within a session's sync log.

3. **Payload normalization** — JSON parse + sorted-key re-serialize before hashing.
   Ensures `{percent:50,note:"ok"}` and `{note:"ok",percent:50}` deduplicate.

4. **No auto-retry on conflict** — UI shows "需要刷新" and user must explicitly refresh.

5. **No Kanban→TW status mapping** — Status IDs must come from project workflow definition.
   Local board columns are independent of remote workflow states.

6. **Token-in-memory only** — The MCP token is extracted from `config.mcp.url` at call time
   and never persisted, logged, or included in error strings.
