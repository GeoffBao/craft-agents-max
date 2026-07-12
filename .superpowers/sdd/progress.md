# Teambition Craft Agents integration progress

Plan: docs/superpowers/plans/2026-07-12-teambition-craft-agent-integration.md

Task 1: complete (commits de1de0e2..8144c561, review acceptable)

Task 2: complete (commits after Task 1 to storage impl)

Task 3: complete (working tree, pre-commit)
- Files: mcp-gateway.ts, mcp-gateway.test.ts
- 21 new tests, all pass
- TypeScript: clean
- Implements: capability probing (style-insensitive tool matching), runtime URL construction (token in memory only), task normalization with credential redaction, explicit write methods mapped to probed tools, recordWorktime as optional method
- Streamable HTTP transport: confirmed via @modelcontextprotocol/sdk v1.29.0
- Research memo findings incorporated: no hardcoded tool prefix, case/style-insensitive matching, token expiry as normal event, credential redaction on agentInstructions
- See .superpowers/sdd/task-3-brief.md, task-3-report.md, task-3-research-memo.md

Task 4: complete (committed after Task 3, ahead of the Task 5/6 commits it was
previously entangled with)
- Found the RPC skeleton (channels/dto/handler/preload) already scaffolded by a prior
  session's Task 5/6 work, but several spec-level guarantees were unmet:
  routing.ts never classified the 7 teambition:* channels (routing.test.ts was
  failing), claim handler didn't validate execution scope, didn't send the initial
  analysis prompt, and had no recoverable path for a binding-persist failure after
  session creation; listMyTasks had no typed re-auth signal.
- Fixed routing.ts classification (REMOTE_ELIGIBLE, next to projects.*).
- Added TeambitionCredentialsMissingError; LIST_TASKS now returns
  { needsReauth: true } instead of throwing when credentials are missing.
- Rewrote CLAIM_TASK to the plan's 7-step order: existing-binding check → fetch
  bundle → validate scope (Feature/Bug require project, else errorCode:
  'invalid_scope') → create-or-resume session (resumeSessionId added to DTO for
  retry-safety) → write snapshot → claim binding (failure → errorCode:
  'binding_persist_failed' with the session id preserved) → best-effort initial
  prompt dispatch.
- Updated TeambitionTaskPicker.tsx to branch on the new errorCode field.
- Added 8 new handler-level tests (mock.module on the dynamic imports) covering
  scope rejection, workspace-only + project-scoped claims, duplicate-taskId
  idempotency, recoverable binding failure, and needsReauth/binding-join listing.
- Verified: teambition.test.ts (23 pass) + server-core typecheck + electron
  typecheck all clean; routing.test.ts now 8/8 pass (was 2 fail); no regressions in
  teambition-integration (49 pass), e2e.test.ts (1 pass), or TeambitionTaskPicker
  renderer tests (12 pass).
- See .superpowers/sdd/task-4-brief.md, task-4-report.md

Task 5: complete (committed a58f719c)
- Files: TeambitionTaskPicker.tsx, TeambitionTaskBadge.tsx, TeambitionTaskActions.tsx, atoms/teambition.ts, test
- 12 tests PASS (scope rules, capabilities, view-model join)
- See .superpowers/sdd/task-5-brief.md, task-5-report.md

Task 6: complete (commit 8c0f7c3f)
- Files: sync-policy.ts, sync-policy.test.ts, teambition.ts (handler rewrite), teambition.test.ts
- New sync-policy module: conflict detection, fingerprint dedup, idempotency, sync logging
- 31 new tests (16 sync-policy + 15 handler patterns)
- RPC handlers: syncProgress, updateStatus, bindProject fully wired
- UI: TeambitionTaskActions updated with pending/conflict states + actual RPC calls
- RPC index: registerTeambitionHandlers added
- Preload: channel-map + ElectronAPI types for 3 new sync operations
- See .superpowers/sdd/task-6-brief.md, task-6-report.md

Task 7: complete (e2e test committed; typecheck-fix commit follow-up)
- Files: fixtures/redacted-task-bundle.json, fixtures/redacted-tool-list.json, e2e.test.ts
- FakeTeambitionGateway-backed offline e2e test: list → claim → duplicate claim (idempotent,
  1 session) → sync progress (synced) → stale update (conflict, no write call) — 1 pass, 16 assertions
- typecheck:all sweep surfaced pre-existing Task 5/6 type errors never caught by package-local
  tsc: duplicate SyncLogEntry export, missing @craft-agent/teambition-integration tsconfig path
  mappings in server-core/server/electron, literal-type test comparisons, TaskTile missing
  sessionId/workspaceId props (workspaceId never threaded through Kanban tree), lucide icon
  title prop, globalThis.electronAPI test typing — all fixed
- Confirmed via git stash: packages/session-tools-core + pi-agent-server tsconfig.base.json /
  keyv-cacheable-request @types failures are pre-existing environment issues, unrelated to
  Teambition, present identically before this task — recorded separately, not fixed (out of scope)
- Verified clean: teambition-integration, server-core, server, electron, ui all pass tsc --noEmit
- Branch boundary verified: git diff --name-only main...HEAD stays within Teambition scope;
  bun.lock and .cursor/ remain unstaged
- See .superpowers/sdd/task-7-brief.md, task-7-report.md

---

## All 7 tasks complete — one-line summary each

1. Domain contract: task kinds, execution scope, TeambitionGateway interface, capability enum.
2. Storage: atomic binding persistence, redacted task-bundle snapshots, append-only sync log.
3. MCP gateway: style-insensitive capability probing, runtime-only token handling, credential redaction.
4. RPC read/claim layer: listMyTasks/claimTask/getBinding/capabilities wired to SessionManager.
5. Kanban UI: task picker, badges, explicit actions, view-model join — no second board.
6. Explicit sync: syncProgress/updateStatus/bindProject with conflict + idempotency guards.
7. End-to-end verification: offline fixture-backed e2e proof + typecheck:all safety net across
   the full Teambition dependency chain; environment-only failures identified and excluded.

MVP functionally complete on 260705-agent. Open API/Webhook integration is explicitly deferred
to a separate future plan (no polling, no webhook ingestion, no automatic worktime submission).
