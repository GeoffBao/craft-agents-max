Status: complete

Commit:
- `5c67f89004b874590cf0a85c67fe6385918806dc`
- Subject: `feat: persist Teambition bindings and snapshots`

Changed files:
- `packages/teambition-integration/src/bindings.ts`
- `packages/teambition-integration/src/task-bundle.ts`
- `packages/teambition-integration/src/storage.test.ts`
- `packages/teambition-integration/src/index.ts`

Scope notes:
- Preserved existing unrelated worktree changes in `bun.lock`, `.cursor/`, and `.superpowers/`.
- Touched only the Task 2 package files plus this required report.

TDD status:
- Red first: added `packages/teambition-integration/src/storage.test.ts` before implementation.
- Verified red with the required focused test.
- Implemented minimal storage/export code to satisfy the test.
- Re-ran focused verification and package typecheck after implementation and again after commit.

Implementation summary:
- Added atomic Teambition binding storage at `{workspaceRoot}/integrations/teambition/bindings.json`.
- Implemented idempotent `claimBinding()` that returns the existing binding for duplicate `taskId`.
- Implemented `loadBindings()` and `findBindingByTaskId()`.
- Implemented task bundle snapshot writing under `sessions/<sessionId>/data/teambition/`:
  - `task.json`
  - `task.md`
- Implemented append-only `sync-log.jsonl` writing with value redaction for `userToken`, `authorization`, `appSecret`, and `accessToken`.
- Redacted all `mcp://` URLs from JSON and Markdown snapshots.
- Exported the new storage surface from `packages/teambition-integration/src/index.ts`.

Exact verification commands and output:

1. Red test, before implementation

Command:
```bash
bun test /Users/admin/Workspace/ClaudeCode/craft-agents-max/packages/teambition-integration/src/storage.test.ts
```

Output:
```text
bun test v1.3.11 (af24e281)

packages/teambition-integration/src/storage.test.ts:

# Unhandled error between tests
-------------------------------
1 | })
2 | {
    ^
SyntaxError: Export named 'writeTaskBundle' not found in module '/Users/admin/Workspace/ClaudeCode/craft-agents-max/packages/teambition-integration/src/index.ts'.
      at loadAndEvaluateModule (2:1)
-------------------------------


 0 pass
 1 fail
 1 error
Ran 1 test across 1 file. [77.00ms]
```

2. Focused test, after implementation

Command:
```bash
bun test /Users/admin/Workspace/ClaudeCode/craft-agents-max/packages/teambition-integration/src/storage.test.ts
```

Output:
```text
bun test v1.3.11 (af24e281)

packages/teambition-integration/src/storage.test.ts:
(pass) Teambition storage > claims a task idempotently and persists redacted task snapshots plus sync logs [12.46ms]

 1 pass
 0 fail
 26 expect() calls
Ran 1 test across 1 file. [28.00ms]
```

3. Package typecheck, after implementation

Command:
```bash
bun run --cwd /Users/admin/Workspace/ClaudeCode/craft-agents-max/packages/teambition-integration typecheck
```

Output:
```text
$ tsc --noEmit
```

4. Fresh post-commit focused verification

Command:
```bash
bun test /Users/admin/Workspace/ClaudeCode/craft-agents-max/packages/teambition-integration/src/storage.test.ts
```

Output:
```text
bun test v1.3.11 (af24e281)

packages/teambition-integration/src/storage.test.ts:
(pass) Teambition storage > claims a task idempotently and persists redacted task snapshots plus sync logs [11.45ms]

 1 pass
 0 fail
 26 expect() calls
Ran 1 test across 1 file. [89.00ms]
```

5. Fresh post-commit package typecheck

Command:
```bash
bun run --cwd /Users/admin/Workspace/ClaudeCode/craft-agents-max/packages/teambition-integration typecheck
```

Output:
```text
$ tsc --noEmit
```

Git status after commit:
```text
 M bun.lock
?? .cursor/
?? .superpowers/
```

Concerns:
- `ExternalTaskBundle` from Task 1 is still intentionally sparse, so the snapshot writer accepts the Task 1 type as its base contract and reads richer optional fields defensively at runtime. That keeps Task 1 untouched, but if Task 3+ wants compile-time guarantees for `description`, `attachments`, `sourceMetadata`, or `agentInstructions`, those fields should be formalized in the domain contract later.

Task 2 review fix: HTTPS URL redaction

Scope:
- Fixed the snapshot leak where ordinary `http://` and `https://` URLs were preserved in `task.json` and `task.md`.
- Kept attachment filenames and non-URL text intact.
- Touched only:
  - `packages/teambition-integration/src/storage.test.ts`
  - `packages/teambition-integration/src/task-bundle.ts`
  - this report

Red test, before the fix

Command:
```bash
bun test /Users/admin/Workspace/ClaudeCode/craft-agents-max/packages/teambition-integration/src/storage.test.ts
```

Output:
```text
bun test v1.3.11 (af24e281)

packages/teambition-integration/src/storage.test.ts:
113 |     expect(taskJson).toContain('Preserve this description verbatim.')
114 |     expect(taskJson).toContain('Keep this note verbatim.')
115 |     expect(taskJson).toContain('design.pdf')
116 |     expect(taskJson).not.toContain('top-secret')
117 |     expect(taskJson).not.toContain('shhh')
118 |     expect(taskJson).not.toContain('https://files.example.com/design.pdf')
                               ^
error: expect(received).not.toContain(expected)

Expected to not contain: "https://files.example.com/design.pdf"
Received: "{\n  \"summary\": {\n    \"taskId\": \"tw-100\",\n    \"title\": \"Stabilize Teambition sync\",\n    \"kind\": \"feature\",\n    \"projectId\": \"tw-project-1\",\n    \"updatedAt\": \"2026-07-12T10:00:00.000Z\"\n  },\n  \"comments\": [\n    {\n      \"commentId\": \"comment-1\",\n      \"content\": \"Keep this note verbatim.\",\n      \"createdAt\": \"2026-07-12T10:05:00.000Z\"\n    }\n  ],\n  \"progress\": {\n    \"percent\": 60,\n    \"updatedAt\": \"2026-07-12T10:06:00.000Z\",\n    \"note\": \"Halfway there.\"\n  },\n  \"binding\": {\n    \"projectId\": \"tw-project-1\",\n    \"scope\": {\n      \"type\": \"project\",\n      \"projectId\": \"tw-project-1\"\n    }\n  },\n  \"description\": \"Preserve this description verbatim.\",\n  \"attachments\": [\n    {\n      \"name\": \"design.pdf\",\n      \"url\": \"https://files.example.com/design.pdf\"\n    },\n    {\n      \"name\": \"secret.txt\",\n      \"url\": \"[REDACTED_MCP_URL]\"\n    }\n  ],\n  \"sourceMetadata\": {\n    \"sourceSlug\": \"teambition\",\n    \"requestId\": \"req-1\",\n    \"sourceUrl\": \"[REDACTED_MCP_URL]\"\n  },\n  \"agentInstructions\": [\n    \"Follow the source task exactly.\",\n    \"Do not expose credentials.\"\n  ]\n}"

      at <anonymous> (/Users/admin/Workspace/ClaudeCode/craft-agents-max/packages/teambition-integration/src/storage.test.ts:118:26)
(fail) Teambition storage > claims a task idempotently and persists redacted task snapshots plus sync logs [12.01ms]

 0 pass
 1 fail
 10 expect() calls
Ran 1 test across 1 file. [95.00ms]
```

Green test, after the fix

Command:
```bash
bun test /Users/admin/Workspace/ClaudeCode/craft-agents-max/packages/teambition-integration/src/storage.test.ts
```

Output:
```text
bun test v1.3.11 (af24e281)

packages/teambition-integration/src/storage.test.ts:
(pass) Teambition storage > claims a task idempotently and persists redacted task snapshots plus sync logs [9.68ms]

 1 pass
 0 fail
 31 expect() calls
Ran 1 test across 1 file. [88.00ms]
```

Package typecheck, after the fix

Command:
```bash
bun run --cwd /Users/admin/Workspace/ClaudeCode/craft-agents-max/packages/teambition-integration typecheck
```

Output:
```text
$ tsc --noEmit
```
