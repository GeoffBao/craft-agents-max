# Task 7 Brief — End-to-end verification and upstream safety check

Plan: `docs/superpowers/plans/2026-07-12-teambition-craft-agent-integration.md` → Task 7

## Goal

Produce a repeatable, offline, fixture-backed verification of the full Teambition task
handoff flow (list → claim → duplicate claim → sync progress → stale-update conflict)
against a `FakeTeambitionGateway`, and confirm the feature branch is safe to hand off:
`bun run typecheck:all` passes (Teambition-scope) and the branch diff stays within the
Teambition integration surface.

## Steps executed

1. **Fixtures** (`packages/teambition-integration/src/fixtures/`)
   - `redacted-task-bundle.json` — one `ExternalTaskBundle` for task `tw-fixture-100`,
     project `tw-project-1`, kind `bug`. All URLs pre-redacted (`[redacted-url]`), no
     tokens/secrets/personal data.
   - `redacted-tool-list.json` — a minimal MCP tool-name list (7 entries) matching the
     capability patterns in `mcp-gateway.ts`, for future capability-probing fixtures.

2. **`e2e.test.ts`** — a `FakeTeambitionGateway` (in-file, implements `TeambitionGateway`)
   backed by the fixture bundle, driving the real `bindings.ts` / `task-bundle.ts` /
   `sync-policy.ts` modules (no mocks of our own code, only the remote gateway is faked).
   Sequence: list → claim (created) → claim again (idempotent, same session) → sync
   progress (succeeds) → stale sync attempt (rejected as `conflict`, `addProgress` NOT
   called). Uses `mkdtempSync`/`rmSync` for isolated workspace roots per the existing
   `storage.test.ts` pattern.

3. **Typecheck sweep** — running `bun run typecheck:all` surfaced **pre-existing** type
   errors from Task 5/Task 6 that had never been caught (their reports only ran
   package-local `tsc`, not the full chain):
   - `packages/teambition-integration/src/index.ts`: duplicate `SyncLogEntry` export
     between `task-bundle.ts` and `sync-policy.ts` (TS2308).
   - `packages/teambition-integration/src/sync-policy.test.ts`: two `noUncheckedIndexedAccess`
     possibly-undefined errors.
   - `packages/server-core`, `packages/server`, `apps/electron`: **no tsconfig path
     mapping** for `@craft-agent/teambition-integration` (module never resolved outside
     the package itself) — this cascaded into implicit-any parameter errors.
   - `packages/server-core/src/handlers/rpc/teambition.test.ts`: literal-type comparison
     errors (`'bug' === 'feature'` narrowed to never-overlap) from un-annotated `const kind = 'bug'`.
   - `apps/electron`: `TaskTile.tsx` rendered `<TeambitionTaskActions>` without required
     `sessionId`/`workspaceId` props (Task 5 never threaded `workspaceId` through
     `KanbanBoardContainer → KanbanBoard → KanbanColumn → TaskTile`); `TeambitionTaskPicker.tsx`
     passed an unsupported `title` prop to a lucide icon; `TeambitionTaskPicker.test.tsx`
     had two implicit-any / bad-globalThis-type issues.
   - Fixed all of the above (see task-7-report.md for the full list and rationale).

4. **Environment-only failures identified and separated** — `packages/session-tools-core`
   (and downstream `pi-agent-server`) fail `tsc --noEmit` with `Cannot read file
   tsconfig.base.json` and `@types/cacheable-request`/`keyv` type mismatches. Verified via
   `git stash` that these failures exist identically on the pre-Task-7 tree — they are
   NOT caused by this work and are out of scope to fix (fixing `tsconfig.base.json` /
   third-party `@types` version skew is unrelated to the Teambition integration).

5. **Branch boundary check** — `git diff --name-only main...HEAD` and
   `git status --short --branch` confirm the change surface stays inside Teambition
   integration/RPC/preload/renderer/i18n/tests/approved-docs; `bun.lock` and `.cursor/`
   remain untouched/unstaged.

## Deliverables

- `packages/teambition-integration/src/fixtures/redacted-task-bundle.json`
- `packages/teambition-integration/src/fixtures/redacted-tool-list.json`
- `packages/teambition-integration/src/e2e.test.ts`
- Fix-forward changes to make `typecheck:all` pass for the Teambition-integration scope
  (see task-7-report.md for the full file list)
