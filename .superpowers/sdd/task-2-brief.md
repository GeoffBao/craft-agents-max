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
