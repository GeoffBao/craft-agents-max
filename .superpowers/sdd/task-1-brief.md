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
