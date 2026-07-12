# Task 5 Report: Projects/Kanban UI Integration

**Date:** 2026-07-12
**Status:** Complete (ready for commit)

## Test output summary

```
bun test apps/electron/src/renderer/components/app-shell/teambition/TeambitionTaskPicker.test.tsx

12 pass, 0 fail, 31 expect() calls

✅ Teambition task scope rules
  ✅ rejects Feature without a projectId
  ✅ rejects Bug without a projectId
  ✅ allows generic Task to be claimed workspace-only
  ✅ allows generic Task to bind to a Craft Project
  ✅ returns existing session for duplicate task claim
  ✅ does not produce a second card for duplicate task

✅ Teambition capabilities
  ✅ reports worktime.write as false when capability absent
  ✅ reports worktime.write as true when capability present
  ✅ reports task.progress.write as present for progress sync

✅ KanbanTask Teambition view-model join
  ✅ joins binding data without mutating SessionMeta
  ✅ excludes workspace-only tasks from project-specific filters
  ✅ workspace-only tasks visible in All Tasks view
```

All 12 tests passed on first successful run after fixing `globalThis` (Bun test env).

## What was implemented

### Step 1: Renderer tests (TDD)
Wrote 12 test cases covering:
- Scope rules: Feature/Bug reject without project, Task allows workspace-only and project binding
- Idempotency: duplicate claim returns existing session, no second card
- Capability detection: worktime.write absent/present, progress.write detection
- View-model join: non-persistent teambition field, workspace-only visibility rules

### Step 2: TeambitionTaskPicker
- Modal overlay with task list, search, kind badges (Fe/Bu/Ta)
- Feature/Bug: shows project selector dropdown (required)
- Generic Task: two-option toggle "Agent Session Only" / "Bind Craft Project", with project selector shown for binding
- Already-claimed tasks show green checkmark
- "Claim" button disabled until valid scope selected; triggers `claimTeambitionTask` RPC
- Loading spinner, empty state, error state, search filtering

### Step 3: TeambitionViewFields on KanbanTask
- Non-persistent view field: `teambition?: { taskId, kind, syncState, projectName? }`
- Joined from `teambitionBindingMapAtom` (sessionId → binding entry) at render time
- Never written to `SessionMeta` persistence
- `syncState` defaults to `'synced'` for bound tasks

### Step 4: TeambitionTaskBadge + TeambitionTaskActions
- **Badge**: compact pill showing task kind (Fe/Bu/Ta) + task ID, color-coded by kind
- **Actions**: dropdown menu with View, Refresh, Sync Progress, Update Status, Bind Project, Record Worktime
- Capability-driven: worktime hidden when `worktime.write` unavailable; sync/status hidden when respective capabilities absent
- Project binding option only shown for workspace-only tasks (`isWorkspaceOnly`)

### Step 5: Kanban semantics preserved
- `handleMoveTask()` unchanged: only writes `kanbanColumn` + optional status, never calls TW
- Workspace-only tasks: `projectId` is `undefined` → invisible under project filter, visible in "All Tasks"

### Step 6: Project mapping
- Feature/Bug use selected Craft Project as local binding
- Generic Task can start workspace-only, later bind project via actions menu
- Picker's `handleClaim` builds appropriate `ExecutionScope` based on kind + user selection

### Step 7: i18n
- 32 strings each in zh-Hans.json and en.json covering:
  - Task kinds (feature/bug/task)
  - Execution scope labels
  - Claim flow (claim, claiming, created, reused, failed, open session)
  - Picker UI (title, subtitle, search, empty, no results)
  - Sync states (synced, pending, conflict, stale)
  - Action labels (view, refresh, sync progress, update status, bind project, record worktime)

### Task 4 RPC infrastructure (minimum needed by Task 5)
- DTOs: `RendererTaskSummary`, `ClaimTeambitionTaskRequest/Response`, capability types
- Channels: `teambition:listMyTasks`, `teambition:claimTask`, `teambition:getBinding`, `teambition:capabilities`
- ElectronAPI type additions + channel-map entries
- Server handler stubs (real wiring deferred to Task 4 completion)

## UI interaction points (for downstream consumers)

| Entry | Location | Action |
|-------|----------|--------|
| **Claim button** | Kanban header, next to "New Task" | Opens TeambitionTaskPicker modal |
| **Task picker** | Modal overlay | Browse/search TW tasks, select scope, claim |
| **TW badge** | TaskTile, top row | Shows kind + task ID, color-coded |
| **TW actions** | TaskTile, footer next to ModelChip | Dropdown: View/Refresh/Sync/Status/Bind/Worktime |
| **Workspace-only tasks** | All Tasks view only | Invisible under project filter; Bind Project in actions menu |

## Files to commit

```
git add apps/electron/src/renderer/components/app-shell/teambition/
git add apps/electron/src/renderer/components/app-shell/kanban/types.ts
git add apps/electron/src/renderer/components/app-shell/kanban/KanbanBoardContainer.tsx
git add apps/electron/src/renderer/components/app-shell/kanban/TaskTile.tsx
git add apps/electron/src/renderer/atoms/teambition.ts
git add packages/shared/src/i18n/locales/zh-Hans.json
git add packages/shared/src/i18n/locales/en.json
git add packages/shared/src/protocol/dto.ts
git add packages/shared/src/protocol/channels.ts
git add apps/electron/src/shared/types.ts
git add apps/electron/src/transport/channel-map.ts
git add packages/server-core/src/handlers/rpc/teambition.ts
```
