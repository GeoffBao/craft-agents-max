## Task 3: Add the User MCP gateway with capability detection

**Files:**
- Create: `packages/teambition-integration/src/mcp-gateway.ts`
- Create: `packages/teambition-integration/src/mcp-gateway.test.ts`
- Modify: `packages/teambition-integration/package.json`
- Modify: `packages/teambition-integration/src/index.ts`

**Key design decisions (per research memo):**
1. Tool name matching is **case-insensitive AND style-insensitive** (camelCase/snake_case/kebab-case all normalized to lowercase-no-separator before matching) — User MCP tool naming style is not documented and enterprise OpenAPI MCP supports configurable `--tool-name-case`.
2. Token is NEVER persisted, logged, or included in error messages — constructed in memory only.
3. Capability probing probes the *connected* MCP server at runtime; no hardcoded enterprise tool prefix.
4. `recordWorktime` is only present when `worktime.write` capability is detected; otherwise undefined.
5. Missing capabilities produce typed errors with the missing capability name.
6. Write methods (`addProgress`, `updateWorkflowStatus`, `addComment`) only map to probed tools; never auto-triggered from read methods.
7. Streamable HTTP transport (confirmed: User MCP uses Streamable HTTP, not stdio/SSE).

**Test plan:**
- Fake MCP transport with known tool list
- Full-toolset fixture: get_current_user, task_list_v2, task_detail_3, progress_read_v3, progress_create_v2, task_update_status, comment_add, worktime_record
- Partial-toolset fixture: same minus worktime_record → recordWorktime is undefined
- Capability probing maps tools correctly
- Write methods only work when corresponding tool is probed
- Missing capability method call throws descriptive error
- Task normalization produces valid ExternalTaskSummary/ExternalTaskBundle
- Credential fields stripped from normalized results
