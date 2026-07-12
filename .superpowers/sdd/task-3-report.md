## Task 3 Report: User MCP Gateway with Capability Detection

**Date:** 2026-07-12
**Branch:** 260705-agent (working tree)

### Pre-Implementation: Failing Tests

Before writing `mcp-gateway.ts`, ran `bun test src/mcp-gateway.test.ts`:

```
error: Cannot find module './mcp-gateway' from '.../mcp-gateway.test.ts'

 0 pass, 1 fail, 1 error
```

**Expected.** `mcp-gateway.ts` did not exist yet.

### Implementation

Created `mcp-gateway.ts` with:

| Module | Lines | Purpose |
|--------|-------|---------|
| `UserMcpGatewayOptions` | 18–25 | Endpoint + async token provider + optional fake client hook |
| `normalizeToolName()` | 33–36 | Lowercase + strip non-alphanumeric for style-insensitive matching |
| `probeCapabilities()` | 39–80 | Pure-function tool list → capability array using substring matching |
| `MissingCapabilityError` | 86–93 | Typed error for missing capabilities |
| `redactCredentials()` | 99–111 | Strip `token=xxx`, `secret=xxx` patterns from text |
| `createUserMcpGateway()` | 195–310 | Gateway factory: one MCP connection, capability probing, method mapping |
| `callTool()` helper | 117–138 | JSON-parsed MCP tool call wrapper |
| Normalization helpers | 143–181 | `toExternalTaskSummary`, `toProgress`, `toComment`, `stripCredentials` |

**Key design decisions implemented from research memo:**
1. **Style-insensitive tool matching** — `normalizeToolName()` strips all non-alphanumeric chars before substring matching, so `get_current_user`, `getCurrentUser`, and `get-current-user` all match.
2. **Token in memory only** — constructed at runtime from `endpoint + getToken()`, never logged or persisted.
3. **No enterprise prefix hardcoding** — capability patterns use generic substring matching (e.g., `tasklist`, `listtask`), not `tw_` or `tb_` prefixes.
4. **`recordWorktime` is optional** — only attached when `worktime.write` is probed.
5. **Write methods are explicit** — never auto-called from read paths.
6. **Credential redaction** on `agentInstructions` before returning bundles.
7. **`MissingCapabilityError`** with capability name in message — no token leak in errors.

### Diff to Existing Types

Added four optional fields to `ExternalTaskBundle` in `domain.ts`:
- `description?: string`
- `attachments?: Record<string, unknown>[]`
- `sourceMetadata?: Record<string, unknown>`
- `agentInstructions?: string[]`

These fields were already used by `task-bundle.ts` via the `LooseBundle` type alias; promoting them to the domain type eliminates the cast pattern and provides type safety for the gateway's `getTaskBundle()` return.

### Final Test Results

```
 32 pass
 0 fail
 111 expect() calls
Ran 32 tests across 3 files. [92.00ms]

=== TYPECHECK ===
(no errors)
```

**Test coverage (21 new tests):**

| Test | Status |
|------|--------|
| Probes all capabilities from full tool set | ✓ |
| `recordWorktime` only present when `worktime.write` probed | ✓ |
| Case-insensitive tool name matching (`Get_Current_User` → identity) | ✓ |
| Style-insensitive matching (`getCurrentUser` camelCase → identity) | ✓ |
| `getCurrentUser` returns normalized user | ✓ |
| `listMyTasks` returns normalized summaries | ✓ |
| `getTaskBundle` returns full bundle with credential redaction | ✓ |
| Bundle includes progress even without separate `progress.read` tool | ✓ |
| `addProgress` → calls progress create tool | ✓ |
| `updateWorkflowStatus` → calls status update tool | ✓ |
| `addComment` → calls comment tool | ✓ |
| `recordWorktime` → calls worktime tool | ✓ |
| Missing `progress.write` → throws `MissingCapabilityError` | ✓ |
| Missing `status.write` → throws `MissingCapabilityError` | ✓ |
| Missing `comment.write` → throws `MissingCapabilityError` | ✓ |
| Missing `worktime.write` → `recordWorktime` is `undefined` | ✓ |
| Read-only calls do NOT auto-trigger write methods | ✓ |
| Token does not appear in error messages | ✓ |
| `probeCapabilities` standalone — full tool set | ✓ |
| `probeCapabilities` standalone — camelCase | ✓ |
| `probeCapabilities` standalone — empty list | ✓ |

### Files Changed

- `packages/teambition-integration/package.json` — added `@modelcontextprotocol/sdk` dependency
- `packages/teambition-integration/src/domain.ts` — added 4 optional fields to `ExternalTaskBundle`
- `packages/teambition-integration/src/index.ts` — added `mcp-gateway` export
- `packages/teambition-integration/src/mcp-gateway.ts` — **new**, 310 lines
- `packages/teambition-integration/src/mcp-gateway.test.ts` — **new**, 345 lines

### Streamable HTTP Transport

The implementation imports and uses `StreamableHTTPClientTransport` from `@modelcontextprotocol/sdk/client/streamableHttp.js` (v1.29.0 confirmed available), satisfying the research memo requirement that User MCP uses Streamable HTTP protocol.
