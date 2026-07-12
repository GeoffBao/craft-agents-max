# Task 4 Report: Expose claim/list/snapshot operations through RPC

## Summary

Closed the gap between "RPC skeleton exists" (opportunistically built during Task 5/6)
and "Task 4's spec-level guarantees are met." Fixed a real pre-existing test failure
(routing exhaustiveness), added execution-scope validation, recoverable binding-failure
handling, initial-prompt dispatch, and a typed re-auth signal to the claim/list handlers.

## Files changed

```
packages/shared/src/protocol/routing.ts                                    | +9
packages/shared/src/protocol/dto.ts                                        | +23 -2
packages/server-core/src/handlers/rpc/teambition.ts                        | +76 -19
packages/server-core/src/handlers/rpc/teambition.test.ts                   | +301 -1
apps/electron/src/renderer/components/app-shell/teambition/TeambitionTaskPicker.tsx | +9 -1
```

No other files touched. `bun.lock`, `.cursor/`, and the two spec docs remain unstaged
exactly as they were before this task (pre-existing, out of scope).

## What changed, by file

**`packages/shared/src/protocol/routing.ts`** — Added the 7 `teambition:*` channels
(`LIST_TASKS`, `CLAIM_TASK`, `GET_BINDING`, `CAPABILITIES`, `SYNC_PROGRESS`,
`UPDATE_STATUS`, `BIND_PROJECT`) to `REMOTE_ELIGIBLE_CHANNELS`, next to `projects.*`.
This was a real bug: `routing.test.ts`'s exhaustiveness check was failing before this
change because these channels (added in Task 5/6) were never classified.

**`packages/shared/src/protocol/dto.ts`**:
- `ListTeambitionTasksResponse` gained optional `needsReauth?: boolean`.
- `ClaimTeambitionTaskRequest` gained optional `resumeSessionId?: string`.
- `ClaimTeambitionTaskResponse` gained optional `errorCode?: 'invalid_scope' |
  'binding_persist_failed'` and `error?: string`, plus the new
  `ClaimTeambitionTaskErrorCode` type export.

**`packages/server-core/src/handlers/rpc/teambition.ts`**:
- New exported `TeambitionCredentialsMissingError` class. `getGateway()`'s three throw
  sites (missing config, missing MCP URL, missing userToken) now throw this instead of
  a bare `Error`.
- `LIST_TASKS` handler: wraps the gateway call in try/catch; on
  `TeambitionCredentialsMissingError` returns `{ tasks: [], capabilities: [],
  needsReauth: true }` instead of throwing.
- `CLAIM_TASK` handler: rewritten to the plan's exact step order —
  1. Check existing binding (unchanged, was already correct).
  2. Fetch task bundle from gateway (unchanged).
  3. **New:** validate scope — `requiresProject = kind === 'feature' || kind === 'bug'`;
     if required and `scope.type !== 'project'` or `projectId` is blank, return
     `{ sessionId: '', created: false, errorCode: 'invalid_scope', error }` without
     creating a session.
  4. **Changed:** create session, *unless* `input.resumeSessionId` is set, in which case
     look it up via `sessionManager.getSession()` and reuse it (retry-safe path).
  5. Write task snapshot (unchanged — idempotent, safe to re-run on retry).
  6. **Changed:** `claimBinding()` wrapped in try/catch. On failure, returns
     `{ sessionId: session.id, created: !resumeSessionId, errorCode:
     'binding_persist_failed', error }` — the session id is preserved so a client retry
     can pass `resumeSessionId` back in and avoid creating a duplicate session.
  7. **New:** best-effort `sessionManager.sendMessage()` with an initial analysis prompt
     referencing the task snapshot location. Wrapped in its own try/catch — a prompt
     dispatch failure is logged as a warning and does NOT turn a successful claim into
     an error response (the binding and snapshot are already durably persisted by this
     point).

**`apps/electron/.../TeambitionTaskPicker.tsx`**: `handleClaim()` now checks
`result.errorCode` first. On `binding_persist_failed` it still calls `onClaimed()` (the
session is real and usable) but shows the error toast; on `invalid_scope` it shows the
error toast and returns without navigating anywhere.

**`packages/server-core/src/handlers/rpc/teambition.test.ts`**: Added two new `describe`
blocks (`registerTeambitionHandlers — CLAIM_TASK` and `— LIST_TASKS`) with 8 new tests,
using `mock.module()` on `@craft-agent/shared/config`, `@craft-agent/shared/sources`, and
`@craft-agent/teambition-integration` to run the real `registerTeambitionHandlers()`
against a fake `RpcServer` + minimal `HandlerDeps.sessionManager` stub. Covers:
rejecting Feature/Bug without a project, allowing workspace-only and project-scoped
generic Task claims, duplicate-taskId idempotency (exactly one `createSession()` call),
recoverable `binding_persist_failed` (session id preserved), and `needsReauth` /
binding-joined `listMyTasks` output.

## Verification

Exact commands from the plan:

```
bun test packages/server-core/src/handlers/rpc/teambition.test.ts && \
  cd packages/server-core && bun run typecheck && \
  cd ../../apps/electron && bun run typecheck
```

Result: **PASS**

```
$ bun test packages/server-core/src/handlers/rpc/teambition.test.ts
23 pass, 0 fail, 54 expect() calls

$ (cd packages/server-core && bun run typecheck)
$ tsc --noEmit
(clean — no output)

$ (cd apps/electron && bun run typecheck)
$ tsc --noEmit
(clean — no output)
```

Additional regression checks run (not required by the plan step, but touched shared
files that could affect other suites):

```
$ bun test packages/shared/src/protocol/__tests__/routing.test.ts
8 pass, 0 fail   (previously 2 fail — routing gap now fixed)

$ bun test packages/teambition-integration/src
49 pass, 0 fail  (Task 1/2/3/6 suites unaffected)

$ bun test packages/teambition-integration/src/e2e.test.ts
1 pass, 0 fail   (Task 7 e2e still green)

$ bun test apps/electron/.../TeambitionTaskPicker.test.tsx
12 pass, 0 fail  (Task 5 renderer tests still green)

$ (cd packages/shared && npx tsc --noEmit)
(clean)
```

## Deviations from the plan

- The plan's Step 5 ("Add preload methods... following the existing `projects`/
  `sessions` pattern") was already satisfied before this task started: `buildClientApi()`
  generates `window.electronAPI.listTeambitionTasks` etc. automatically from
  `CHANNEL_MAP` entries (added in the Task 5 commit), so no `bootstrap.ts` edit was
  needed or made. Verified by grep — `channel-map.ts` has all 7 `teambition:*` entries
  and `apps/electron/src/shared/types.ts` types them on `ElectronAPI`.
- `resumeSessionId` was not in the original plan text but was necessary to satisfy the
  plan's own constraint ("If binding persistence fails after session creation, return
  the session ID and a recoverable error without creating a second session on retry")
  — the response alone can't prevent a *second RPC call* from re-creating a session
  without some way for the client to say "reuse this one."
- Did not touch `SYNC_PROGRESS`/`UPDATE_STATUS`/`BIND_PROJECT` (Task 6 scope) or the
  Kanban UI (Task 5 scope) beyond the one claim-response branch in the picker needed to
  avoid silently treating an `errorCode` response as success.

## Branch boundary check

```
$ git status --short --branch
## 260705-agent...origin/260705-agent [ahead 13]
 M .superpowers/sdd/task-2-report.md          (pre-existing, untouched by this task)
 M apps/electron/.../TeambitionTaskPicker.tsx  (this task)
 M bun.lock                                    (pre-existing, untouched by this task)
 M docs/superpowers/specs/...design.md         (pre-existing, untouched by this task)
 M docs/superpowers/specs/...ui-amendment.md   (pre-existing, untouched by this task)
 M packages/server-core/.../teambition.test.ts (this task)
 M packages/server-core/.../teambition.ts      (this task)
 M packages/shared/src/protocol/dto.ts         (this task)
 M packages/shared/src/protocol/routing.ts     (this task)
?? .cursor/                                    (pre-existing, untouched)
?? .superpowers/sdd/*.md, *.diff, task.yaml    (pre-existing, untouched)
```

`bun.lock` and `.cursor/` remain unstaged, per the plan's global constraint.
