# Task 4 Brief: Expose claim/list/snapshot operations through RPC

## What

Plan: `docs/superpowers/plans/2026-07-12-teambition-craft-agent-integration.md`, Task 4.

Expose `teambition:listMyTasks`, `teambition:claimTask`, `teambition:getBinding`, and
`teambition:capabilities` as typed RPC operations, wiring the Task 3 User MCP gateway
and Task 2 binding/snapshot storage to `SessionManager.createSession()`.

## Why

Without this layer the renderer (Task 5) has no way to list Teambition tasks or turn a
task into a Craft session. The claim flow is the seam between "external task" and
"Craft-native session" — it must be idempotent (duplicate claims reuse the session),
scope-aware (Feature/Bug require a Craft Project; generic Task can be workspace-only),
and safe to retry (a binding-write failure after session creation must not spawn a
second session on retry).

## Starting state (discovered before writing new code)

A prior session's Task 5/6 commits (`a58f719c`, `8c0f7c3f`) had already scaffolded most
of this layer opportunistically while building the Kanban UI and sync operations:
`channels.ts`, `dto.ts`, `packages/server-core/src/handlers/rpc/teambition.ts`, and the
electron `channel-map.ts`/`shared/types.ts` preload surface all existed and typechecked
clean. `progress.md` correctly flagged this as "Task 4: pending" because the spec-level
guarantees were not yet met:

1. **Routing gap (real bug):** `packages/shared/src/protocol/routing.ts` never classified
   the 7 `teambition:*` channels into `LOCAL_ONLY` or `REMOTE_ELIGIBLE`. The exhaustiveness
   test (`routing.test.ts`) was failing on `main`/`260705-agent` before this task.
2. **No execution-scope validation in the claim handler.** The existing handler read
   `scope.projectId` but never rejected a Feature/Bug claim missing a project — it would
   silently create an unscoped session.
3. **No initial analysis prompt dispatch** after claim, per plan Step 4 ("send the initial
   analysis prompt").
4. **No recoverable-error path for binding-persist failure.** A `claimBinding()` throw
   after `createSession()` would propagate as a generic RPC error with no session id,
   so a client retry would call `createSession()` again — the plan explicitly forbids this
   ("retry does not create a second session").
5. **No typed re-authentication signal** for `listMyTasks` when Teambition credentials are
   missing/expired — the plan requires "a typed re-authentication error", not a bare throw.
6. **No RPC-level tests** exercising `registerTeambitionHandlers` directly (the existing
   `teambition.test.ts` only unit-tested `sync-policy` helpers, not the CLAIM_TASK/LIST_TASKS
   handlers via a fake `RpcServer`/`HandlerDeps`).

## Approach

- Fix `routing.ts` (classify all 7 channels as `REMOTE_ELIGIBLE`, matching `projects.*`).
- Add `TeambitionCredentialsMissingError` in `teambition.ts`; `getGateway()` throws it
  instead of a generic `Error` when the source config/URL/token is absent. `LIST_TASKS`
  catches it and returns `{ tasks: [], capabilities: [], needsReauth: true }`.
- Extend `ListTeambitionTasksResponse` with optional `needsReauth?: boolean`.
- Extend `ClaimTeambitionTaskResponse` with optional `errorCode?: 'invalid_scope' |
  'binding_persist_failed'` and `error?: string`; extend `ClaimTeambitionTaskRequest` with
  optional `resumeSessionId?: string` so a retry after a binding failure reuses the
  already-created session instead of calling `createSession()` again.
- Rewrite the `CLAIM_TASK` handler body to follow the plan's exact 7-step order: check
  existing binding → fetch bundle → validate scope → create-or-resume session → write
  snapshot → claim binding (catch failure → recoverable response) → send initial prompt
  (best-effort, never blocks a successful claim).
- Update `TeambitionTaskPicker.tsx`'s claim handler to branch on `errorCode` instead of
  treating every response as success.
- Add 8 new handler-level tests to `teambition.test.ts` using `mock.module()` on the two
  dynamically-imported modules (`@craft-agent/shared/config`, `@craft-agent/shared/sources`,
  `@craft-agent/teambition-integration`) so `registerTeambitionHandlers()` runs against a
  fake `RpcServer` + `HandlerDeps`, per the plan's Step 1 ("Add RPC DTO tests").

## Explicitly out of scope

- Renderer-side wiring of `needsReauth`/`errorCode` beyond the one-line toast branch
  (a full "re-authenticate" UI flow is not in this plan).
- Preload/`bootstrap.ts` changes — `buildClientApi()` already auto-generates the 4
  (+3 sync, from Task 6) preload methods from `CHANNEL_MAP`; no manual overrides needed.
