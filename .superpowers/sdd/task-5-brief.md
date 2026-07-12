# Task 5 Brief: Projects/Kanban UI Integration

**Date:** 2026-07-12
**Task:** Add the existing Projects/Kanban UI integration
**Plan:** docs/superpowers/plans/2026-07-12-teambition-craft-agent-integration.md

## What was built

Task 5 adds Teambition task visibility and claiming into the existing Craft Agents Projects/Kanban UI. No second board is created — TW tasks reuse the existing board, badges, and action menus.

## Files changed/created

### New files
- `apps/electron/src/renderer/components/app-shell/teambition/TeambitionTaskPicker.tsx` — Modal picker for claiming TW tasks
- `apps/electron/src/renderer/components/app-shell/teambition/TeambitionTaskBadge.tsx` — Compact TW badge on TaskTile
- `apps/electron/src/renderer/components/app-shell/teambition/TeambitionTaskActions.tsx` — Dropdown menu of TW actions
- `apps/electron/src/renderer/atoms/teambition.ts` — Jotai atoms for TW state (non-persistent)
- `apps/electron/src/renderer/components/app-shell/teambition/TeambitionTaskPicker.test.tsx` — 12 tests (PASS)

### Modified files
- `apps/electron/src/renderer/components/app-shell/kanban/types.ts` — Added `TeambitionViewFields` to `KanbanTask`
- `apps/electron/src/renderer/components/app-shell/kanban/KanbanBoardContainer.tsx` — TW claim button, binding join, picker render
- `apps/electron/src/renderer/components/app-shell/kanban/TaskTile.tsx` — TW badge + actions in tile
- `packages/shared/src/i18n/locales/zh-Hans.json` — 32 Chinese TW strings
- `packages/shared/src/i18n/locales/en.json` — 32 English TW strings

### Task 4 dependencies (minimal RPC)
- `packages/shared/src/protocol/dto.ts` — Teambition RPC DTOs
- `packages/shared/src/protocol/channels.ts` — `teambition:` RPC channels
- `apps/electron/src/shared/types.ts` — `ElectronAPI` method signatures
- `apps/electron/src/transport/channel-map.ts` — Channel map entries
- `packages/server-core/src/handlers/rpc/teambition.ts` — Stub handler

## Key design decisions

1. **Non-persistent view fields**: `KanbanTask.teambition` is derived from binding data at render time via `bindingMap` join. Never stored in `SessionMeta`.
2. **Scope rules**: Feature/Bug force project selection; generic Task offers workspace-only + project binding.
3. **Kanban semantics preserved**: `handleMoveTask()` only changes local Craft state. No implicit TW writes.
4. **Workspace-only visibility**: workspace-only tasks visible in "All Tasks", excluded from project-specific filters.
5. **Capability-driven UI**: `TeambitionTaskActions` hides worktime operations when `worktime.write` capability is absent.
