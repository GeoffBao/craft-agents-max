# Teambition - Craft Agents Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a decoupled, user-triggered Teambition task intake flow that creates or reuses a Craft Agent session, displays the task in the existing Projects/Kanban UI, and supports explicit progress/status synchronization back to Teambition.

**Architecture:** Add a standalone `@craft-agent/teambition-integration` package with a stable `TeambitionGateway` interface. The first gateway implementation uses the enterprise User MCP; an Open API gateway remains a later implementation of the same interface. Thin RPC and renderer adapters call the integration package, while existing SessionManager, Source, and Kanban primitives remain generic.

**Tech Stack:** Bun workspaces, TypeScript, Zod, existing MCP SDK/client utilities, Electron preload RPC, React, Jotai, Vitest/Bun tests, file-backed workspace/session storage.

## Global Constraints

- Keep `main` as the upstream mirror; implement only on `260705-agent` and feature branches based on it.
- Reuse the existing Projects and Kanban UI; do not add a second Teambition board.
- Feature and Bug tasks require a Craft Project; generic Task supports `workspace` or `project` execution scope.
- A Kanban drag changes Craft state only; Teambition writes require an explicit sync action.
- Do not store the complete User MCP URL with `userToken` in ordinary config, prompts, sessions, logs, or exported bundles.
- Do not modify the generic Session protocol to add Teambition fields; store binding data under the workspace integration directory.
- Do not implement polling, Webhook ingestion, automatic task completion, automatic worktime submission, or multi-agent task claiming in this plan.
- Preserve existing unstaged `bun.lock` and untracked `.cursor/` changes; never include them in commits.

---

## Task 1: Create the Teambition domain package and gateway contract

**Files:**
- Create: `packages/teambition-integration/package.json`
- Create: `packages/teambition-integration/tsconfig.json`
- Create: `packages/teambition-integration/src/domain.ts`
- Create: `packages/teambition-integration/src/gateway.ts`
- Create: `packages/teambition-integration/src/index.ts`
- Test: `packages/teambition-integration/src/domain.test.ts`

**Interfaces:**
- Consumes: no Craft Agents runtime APIs.
- Produces: `TeambitionTaskKind`, `ExecutionScope`, `TeambitionBinding`, `ExternalTaskSummary`, `ExternalTaskBundle`, `SyncResult`, and `TeambitionGateway`.

- [ ] **Step 1: Write domain tests first**

Add tests for the three task kinds and two execution scopes:

```ts
import { describe, expect, it } from 'bun:test'
import { parseExternalTaskSummary, type ExternalTaskSummary } from './domain'

describe('Teambition domain', () => {
  it('accepts feature, bug, and generic task kinds', () => {
    const input: ExternalTaskSummary = {
      taskId: 'tw-100',
      title: 'Fix login timeout',
      kind: 'bug',
      projectId: 'tw-project-1',
      updatedAt: '2026-07-12T10:00:00.000Z',
    }
    expect(parseExternalTaskSummary(input).kind).toBe('bug')
  })

  it('rejects a project task without a project binding', () => {
    expect(() => parseExternalTaskSummary({
      taskId: 'tw-101',
      title: 'Add export',
      kind: 'feature',
      updatedAt: '2026-07-12T10:00:00.000Z',
    })).toThrow()
  })
})
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `bun test packages/teambition-integration/src/domain.test.ts`

Expected: FAIL because the package and domain parser do not exist.

- [ ] **Step 3: Implement the minimal domain types and parser**

Define `TeambitionTaskKind = 'feature' | 'bug' | 'task'` and `ExecutionScope` as:

```ts
export type ExecutionScope =
  | { type: 'workspace' }
  | { type: 'project'; projectId: string }
```

`parseExternalTaskSummary()` must require `projectId` for `feature` and `bug`, permit it for `task`, and reject empty `taskId`, `title`, or `updatedAt`.

- [ ] **Step 4: Add the gateway contract**

Define these exact operations:

```ts
export interface TeambitionGateway {
  getCurrentUser(): Promise<TeambitionUser>
  listMyTasks(input: ListMyTasksInput): Promise<ExternalTaskSummary[]>
  getTaskBundle(taskId: string): Promise<ExternalTaskBundle>
  addProgress(taskId: string, input: ProgressInput): Promise<SyncResult>
  updateWorkflowStatus(taskId: string, input: WorkflowStatusInput): Promise<SyncResult>
  addComment(taskId: string, content: string): Promise<SyncResult>
  recordWorktime?: (taskId: string, input: WorktimeInput) => Promise<SyncResult>
}
```

Include capability reporting so unsupported MCP tools do not become hidden runtime failures:

```ts
export type TeambitionCapability =
  | 'identity'
  | 'task.list'
  | 'task.detail'
  | 'task.progress.read'
  | 'task.progress.write'
  | 'task.status.write'
  | 'task.comment.write'
  | 'worktime.read'
  | 'worktime.write'
```

- [ ] **Step 5: Run typecheck and tests**

Run: `bun test packages/teambition-integration/src/domain.test.ts && cd packages/teambition-integration && bun run tsc --noEmit`

Expected: PASS.

- [ ] **Step 6: Commit the standalone domain package**

```bash
git add packages/teambition-integration
git commit -m "feat: add Teambition integration domain contract"
```

## Task 2: Implement secure binding and task snapshot storage

**Files:**
- Create: `packages/teambition-integration/src/bindings.ts`
- Create: `packages/teambition-integration/src/task-bundle.ts`
- Create: `packages/teambition-integration/src/storage.test.ts`
- Modify: `packages/teambition-integration/src/index.ts`

**Interfaces:**
- Consumes: `TeambitionBinding`, `ExternalTaskBundle`, and workspace root path.
- Produces: `loadBindings()`, `claimBinding()`, `findBindingByTaskId()`, `writeTaskBundle()`, and `appendSyncLog()`.

- [ ] **Step 1: Write idempotency and snapshot tests**

Use a temporary workspace directory and assert that claiming `workspace-1 + tw-100` twice returns the same session ID and does not append a second binding.

```ts
const first = await claimBinding(root, {
  provider: 'teambition', taskId: 'tw-100', sessionId: 'session-1', sourceSlug: 'teambition', state: 'claimed', claimedAt: '2026-07-12T10:00:00.000Z',
})
const second = await claimBinding(root, { ...first, sessionId: 'session-2' })
expect(second.sessionId).toBe('session-1')
```

Also assert that `task.json`, `task.md`, and `sync-log.jsonl` are created under `sessions/session-1/data/teambition/` and that task content is preserved verbatim.

- [ ] **Step 2: Run tests and verify failure**

Run: `bun test packages/teambition-integration/src/storage.test.ts`

Expected: FAIL because storage functions do not exist.

- [ ] **Step 3: Implement atomic binding storage**

Store bindings at `{workspaceRoot}/integrations/teambition/bindings.json`. Create the directory when absent, read invalid/missing files as an empty binding list, and write through a temporary file followed by rename. `claimBinding()` must return the existing record for a duplicate `taskId` instead of overwriting its session ID.

- [ ] **Step 4: Implement task bundle writing**

Write JSON using stable indentation and generate Markdown with these sections in order: title, description, Log/进展, attachments, source metadata, and Agent instructions. Never include credentials or the complete MCP URL in either file.

- [ ] **Step 5: Implement append-only sync logging**

Append one JSON object per operation with `operation`, `taskId`, `sessionId`, `timestamp`, `result`, and optional `requestId`/`error`. Redact any value containing `userToken`, `authorization`, `appSecret`, or `accessToken` before writing.

- [ ] **Step 6: Run focused tests and commit**

Run: `bun test packages/teambition-integration/src/storage.test.ts`

Expected: PASS.

```bash
git add packages/teambition-integration
git commit -m "feat: persist Teambition bindings and snapshots"
```

## Task 3: Add the User MCP gateway with capability detection

**Files:**
- Create: `packages/teambition-integration/src/mcp-gateway.ts`
- Create: `packages/teambition-integration/src/mcp-gateway.test.ts`
- Modify: `packages/teambition-integration/package.json`
- Modify: `packages/teambition-integration/src/index.ts`

**Interfaces:**
- Consumes: `TeambitionGateway`, `McpSourceConfig`, and a runtime credential provider.
- Produces: `createUserMcpGateway(options): Promise<TeambitionGateway>` and `probeCapabilities()`.

- [ ] **Step 1: Create a fake MCP transport test harness**

Stub tool listing and tool calls for `get current user`, `list tasks`, `get task detail`, `get progress`, `create progress`, `update status`, and `comment`. Add a fixture where `worktime.write` is absent and assert that `recordWorktime` is undefined.

- [ ] **Step 2: Run the gateway tests and verify failure**

Run: `bun test packages/teambition-integration/src/mcp-gateway.test.ts`

Expected: FAIL because `createUserMcpGateway()` does not exist.

- [ ] **Step 3: Implement capability probing**

Create one MCP client connection, list tools, normalize tool names case-insensitively, and map tool aliases to the domain capabilities. Do not hardcode a single enterprise tool prefix. Return an error containing the missing capability name when a required operation is invoked without a matching tool.

- [ ] **Step 4: Implement runtime URL construction**

Accept an endpoint without credentials and a credential provider returning the User MCP token. Construct the query parameter only in memory for the MCP connection. Never persist the resulting URL or pass it into log/error strings.

- [ ] **Step 5: Implement task normalization**

Normalize tool results into `ExternalTaskSummary` and `ExternalTaskBundle`. Preserve raw Log/progress text and attachment metadata, but strip credential-looking fields before returning the bundle.

- [ ] **Step 6: Implement explicit write methods**

Map `addProgress`, `updateWorkflowStatus`, and `addComment` only to probed tools. Return the remote request ID and updated timestamp. Do not automatically call a write method from a read method or from Agent message streaming.

- [ ] **Step 7: Run tests and commit**

Run: `bun test packages/teambition-integration/src/mcp-gateway.test.ts && cd packages/teambition-integration && bun run tsc --noEmit`

Expected: PASS.

```bash
git add packages/teambition-integration
git commit -m "feat: add Teambition User MCP gateway"
```

## Task 4: Expose claim/list/snapshot operations through RPC

**Files:**
- Modify: `packages/shared/src/protocol/channels.ts`
- Modify: `packages/shared/src/protocol/dto.ts`
- Modify: `packages/server-core/src/handlers/rpc/index.ts`
- Create: `packages/server-core/src/handlers/rpc/teambition.ts`
- Create: `packages/server-core/src/handlers/rpc/teambition.test.ts`
- Modify: `apps/electron/src/preload/bootstrap.ts`

**Interfaces:**
- Consumes: `TeambitionGateway`, binding storage, task bundle storage, and existing `SessionManager.createSession()`.
- Produces RPC operations named `teambition:listMyTasks`, `teambition:claimTask`, `teambition:getBinding`, and `teambition:capabilities`.

- [ ] **Step 1: Add RPC DTO tests**

Test that `teambition:claimTask` rejects an unknown task kind, requires a Craft Project for Feature/Bug, allows workspace-only generic Task, and returns the existing session for a duplicate task ID.

- [ ] **Step 2: Add channel and DTO definitions**

Extend the existing typed channel maps with the four read/claim operations. Keep all Teambition fields in Teambition-specific DTOs; do not add them to the generic `Session` DTO.

- [ ] **Step 3: Implement the list handler**

Resolve the workspace, build the configured User MCP gateway, call `listMyTasks({ executor: 'me' })`, and return normalized summaries plus capabilities. Missing credentials must return a typed re-authentication error.

- [ ] **Step 4: Implement the claim handler**

Perform these steps in order: load the task bundle, check an existing binding, validate execution scope, call `SessionManager.createSession()` with `projectId` only for project scope, write the task snapshot, claim the binding, and send the initial analysis prompt. If binding persistence fails after session creation, return the session ID and a recoverable error without creating a second session on retry.

- [ ] **Step 5: Add preload methods**

Expose typed `listTeambitionTasks`, `claimTeambitionTask`, `getTeambitionBinding`, and `getTeambitionCapabilities` methods through `window.electronAPI`, following the existing `projects` and `sessions` patterns.

- [ ] **Step 6: Run focused tests and typecheck**

Run: `bun test packages/server-core/src/handlers/rpc/teambition.test.ts && cd packages/server-core && bun run typecheck && cd ../../apps/electron && bun run typecheck`

Expected: PASS.

```bash
git add packages/shared/src/protocol packages/server-core/src/handlers/rpc apps/electron/src/preload/bootstrap.ts
git commit -m "feat: expose Teambition task claiming RPC"
```

## Task 5: Add the existing Projects/Kanban UI integration

**Files:**
- Modify: `apps/electron/src/renderer/components/app-shell/kanban/types.ts`
- Modify: `apps/electron/src/renderer/components/app-shell/kanban/KanbanBoardContainer.tsx`
- Modify: `apps/electron/src/renderer/components/app-shell/kanban/TaskTile.tsx`
- Modify: `apps/electron/src/renderer/components/app-shell/kanban/TaskEditor.tsx`
- Create: `apps/electron/src/renderer/components/app-shell/teambition/TeambitionTaskPicker.tsx`
- Create: `apps/electron/src/renderer/components/app-shell/teambition/TeambitionTaskBadge.tsx`
- Create: `apps/electron/src/renderer/components/app-shell/teambition/TeambitionTaskActions.tsx`
- Create: `apps/electron/src/renderer/atoms/teambition.ts`
- Modify: `packages/shared/src/i18n/locales/zh-Hans.json`
- Modify: `packages/shared/src/i18n/locales/en.json`
- Test: `apps/electron/src/renderer/components/app-shell/teambition/TeambitionTaskPicker.test.tsx`

**Interfaces:**
- Consumes: preload RPC methods from Task 4 and existing `KanbanTask.projectId`, project filters, custom columns, and TaskTile actions.
- Produces: a picker for “从 TW 领取任务”, external task badges/actions, and a binding-aware Kanban tile without a second board.

- [ ] **Step 1: Add renderer tests for task scope rules**

Test that Feature/Bug without a Craft Project cannot be claimed, generic Task can choose workspace-only, and generic Task can choose a Craft Project. Test that a duplicate task opens the existing session instead of showing a second card.

- [ ] **Step 2: Add the Teambition task picker**

Load task summaries and capability state from preload RPC. Show type, title, TW project, updated time, and existing binding state. Require a project selection for Feature/Bug; offer “仅创建 Agent 对话” and “绑定 Craft Project” for generic Task.

- [ ] **Step 3: Add external metadata to the Kanban view model**

Extend `KanbanTask` with an optional non-persistent `teambition` view field containing `taskId`, `kind`, `syncState`, and `projectName`. Populate it by joining binding data to `SessionMeta.id`; do not add Teambition fields to `SessionMeta` persistence.

- [ ] **Step 4: Add badge and actions to TaskTile**

Render a compact TW badge and explicit actions for view, refresh, sync progress, update status, and project binding. Hide worktime actions when the capability response says `worktime.write` is unavailable.

- [ ] **Step 5: Preserve Kanban semantics**

Keep existing `handleMoveTask()` behavior local to Craft. Do not call a Teambition write when a card moves between columns. Keep workspace-only tasks visible in All Tasks and excluded from a project-specific filter.

- [ ] **Step 6: Add Project mapping behavior**

For Feature/Bug, use the selected Craft Project as the local binding. For generic Task, allow changing from workspace-only to project-bound through the task action menu without recreating the session.

- [ ] **Step 7: Add translations and run renderer tests**

Add Chinese and English strings for task kinds, execution scope, capabilities, claim errors, sync states, and explicit actions.

Run: `bun test apps/electron/src/renderer/components/app-shell/teambition/TeambitionTaskPicker.test.tsx`

Expected: PASS.

```bash
git add apps/electron/src/renderer packages/shared/src/i18n/locales/zh-Hans.json packages/shared/src/i18n/locales/en.json
git commit -m "feat: show Teambition tasks in Projects Kanban"
```

## Task 6: Add explicit progress/status synchronization

**Files:**
- Create: `packages/teambition-integration/src/sync-policy.ts`
- Create: `packages/teambition-integration/src/sync-policy.test.ts`
- Modify: `packages/server-core/src/handlers/rpc/teambition.ts`
- Modify: `packages/shared/src/protocol/channels.ts`
- Modify: `packages/shared/src/protocol/dto.ts`
- Modify: `apps/electron/src/preload/bootstrap.ts`
- Modify: `apps/electron/src/renderer/components/app-shell/teambition/TeambitionTaskActions.tsx`

**Interfaces:**
- Consumes: binding, session transcript summary, gateway capabilities, and remote task `updatedAt`.
- Produces: `teambition:syncProgress`, `teambition:updateStatus`, and `teambition:bindProject` RPC operations.

- [ ] **Step 1: Write sync policy tests**

Assert that a sync is rejected when the remote task is newer than the local snapshot, duplicate operation fingerprints are ignored, and a successful operation appends a redacted sync log.

- [ ] **Step 2: Implement conflict and idempotency checks**

Before every write, fetch the current task metadata. Compare remote `updatedAt` with the snapshot timestamp. Use a fingerprint composed of `taskId`, `operation`, `sessionId`, and the normalized payload. Return `conflict`, `already_synced`, or `synced` explicitly.

- [ ] **Step 3: Implement progress synchronization**

Build the progress body from the current session summary: conclusion, risks, next steps, and a local session reference. Call `addProgress()` only after the user action. Append success or failure to `sync-log.jsonl`.

- [ ] **Step 4: Implement workflow status synchronization**

Load the project’s actual workflow status IDs and require the UI-selected target. Call `updateWorkflowStatus()` only after explicit confirmation. Never translate the local Kanban column directly into a remote status without a configured mapping.

- [ ] **Step 5: Implement project binding**

For a workspace-only generic Task, update the binding and session project association in one RPC operation. Keep the same `sessionId` and task snapshot. Reject binding a Feature/Bug to an empty project.

- [ ] **Step 6: Add UI confirmation and pending-sync states**

Show the target remote status before submitting. On network failure, retain the local result and show “待同步”; on conflict, show “需要刷新” and do not retry automatically.

- [ ] **Step 7: Run focused tests and commit**

Run: `bun test packages/teambition-integration/src/sync-policy.test.ts packages/server-core/src/handlers/rpc/teambition.test.ts`

Expected: PASS.

```bash
git add packages/teambition-integration packages/server-core/src/handlers/rpc packages/shared/src/protocol apps/electron/src/preload/bootstrap.ts apps/electron/src/renderer/components/app-shell/teambition
git commit -m "feat: add explicit Teambition progress and status sync"
```

## Task 7: End-to-end verification and upstream safety check

**Files:**
- Create: `packages/teambition-integration/src/fixtures/redacted-task-bundle.json`
- Create: `packages/teambition-integration/src/fixtures/redacted-tool-list.json`
- Create: `packages/teambition-integration/src/e2e.test.ts`
- Modify: `docs/superpowers/specs/2026-07-12-teambition-craft-agent-integration-design.md` only if implementation behavior differs from the approved design.

**Interfaces:**
- Consumes: the complete fake gateway, binding store, RPC handlers, and renderer-facing DTOs.
- Produces: a repeatable offline verification of claim, session reuse, snapshot creation, and explicit sync behavior.

- [ ] **Step 1: Add redacted fixtures**

Use task ID `tw-fixture-100`, project ID `tw-project-1`, and session ID `session-fixture-1`. Do not include a real URL, Token, AppSecret, or personal data.

- [ ] **Step 2: Write the end-to-end test**

Run this sequence against `FakeTeambitionGateway`: list tasks, claim a Bug into `craft-project-1`, claim it again, verify one binding/session, sync progress, attempt a stale update, and assert the stale update returns `conflict` without calling the write method.

- [ ] **Step 3: Run the integration test**

Run: `bun test packages/teambition-integration/src/e2e.test.ts`

Expected: PASS with one created binding, one session ID, one successful progress sync, and one rejected conflict.

- [ ] **Step 4: Run relevant project validation**

Run: `bun run typecheck:all`

Expected: PASS. Existing environment-only warnings must be recorded separately from integration failures.

- [ ] **Step 5: Verify the branch boundary**

Run: `git diff --name-only main...HEAD` and `git status --short --branch`.

Expected: only Teambition integration, RPC, preload, renderer, localization, tests, and approved docs are in the feature history; `bun.lock` and `.cursor/` remain unstaged.

- [ ] **Step 6: Commit verification artifacts**

```bash
git add packages/teambition-integration/src/fixtures packages/teambition-integration/src/e2e.test.ts
git commit -m "test: verify Teambition task handoff flow"
```

## Future Follow-up Plan: Open API and Webhook

Do not implement this in the first plan. Create a separate plan after the User MCP flow is validated:

1. Add `OpenApiGateway` using enterprise AppId/AppSecret/orgId credentials.
2. Map the same `TeambitionGateway` operations to REST endpoints.
3. Add capability-aware actual worktime create/update.
4. Add signed Webhook ingestion, event idempotency, replay, and binding refresh.
5. Add central audit and multi-user authorization.

## Plan Self-Review

- Spec coverage: task kinds, workspace/project execution scope, local snapshot, session binding, MCP gateway, explicit progress/status sync, credential redaction, conflict handling, Project/Kanban reuse, and upstream isolation each have a task.
- Scope control: Open API and Webhook are explicitly deferred to a separate follow-up plan.
- Type consistency: `TeambitionGateway`, `TeambitionBinding`, `ExecutionScope`, capability names, RPC names, and `KanbanTask.teambition` are named consistently across tasks.
- Placeholder scan: no TODO/TBD or unspecified implementation step remains; test IDs and paths are concrete.
