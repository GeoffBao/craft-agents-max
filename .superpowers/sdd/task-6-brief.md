# Task 6 Brief — Explicit Progress/Status Synchronization

**Started:** 2026-07-12T22:35 CST  
**Status:** In Progress

## Scope

Add explicit progress/status synchronization between Craft Agent sessions and
Teambition tasks, with conflict detection, idempotency guards, and sync logging.

## Files

| Action | File |
|--------|------|
| **Create** | `packages/teambition-integration/src/sync-policy.ts` |
| **Create** | `packages/teambition-integration/src/sync-policy.test.ts` |
| **Modify** | `packages/teambition-integration/src/index.ts` |
| **Modify** | `packages/server-core/src/handlers/rpc/teambition.ts` |
| **Create** | `packages/server-core/src/handlers/rpc/teambition.test.ts` |
| **Modify** | `packages/server-core/src/handlers/rpc/index.ts` |
| **Modify** | `packages/shared/src/protocol/dto.ts` |
| **Modify** | `apps/electron/src/transport/channel-map.ts` |
| **Modify** | `apps/electron/src/shared/types.ts` |
| **Modify** | `apps/electron/src/renderer/components/app-shell/teambition/TeambitionTaskActions.tsx` |

## Key Design Decisions

1. **Sync-policy as a standalone module** — `sync-policy.ts` contains pure functions
   for conflict detection, fingerprint computation, idempotency checks, and sync log
   entry creation. No I/O, no gateway dependency.

2. **FNV-1a-like hashing** — Fingerprints use a simple non-crypto hash of
   `taskId::operation::sessionId::normalizedPayload` for deterministic deduplication
   without a crypto dependency.

3. **Payload normalization** — Input JSON payloads are parsed and re-serialized with
   sorted keys before hashing, so `{a:1,b:2}` and `{b:2,a:1}` produce the same fingerprint.

4. **Three-tier sync result** — Every write returns `synced | conflict | already_synced`
   explicitly. No auto-retry on conflict.

5. **Handler-level gateway construction** — The RPC handler builds the gateway from
   workspace source config at call time, extracting the token from the MCP URL in memory
   only (never persisted).

## RPC Operations Added

| Channel | Request | Response |
|---------|---------|----------|
| `teambition:syncProgress` | `{workspaceId, taskId, sessionId, percent, note?}` | `{result, message, syncedAt?, remoteUpdatedAt?}` |
| `teambition:updateStatus` | `{workspaceId, taskId, sessionId, statusId, note?}` | `{result, message, syncedAt?, remoteUpdatedAt?}` |
| `teambition:bindProject` | `{workspaceId, taskId, sessionId, projectId}` | `{result, message, sessionId}` |

## Test Coverage

- **sync-policy.test.ts**: 16 tests (conflict detection, fingerprint determinism, idempotency)
- **teambition.test.ts (server-core)**: 15 tests (handler-level sync/status/bind patterns, preflight check, sync log entry)
- **Total**: 31 new tests, all PASS
