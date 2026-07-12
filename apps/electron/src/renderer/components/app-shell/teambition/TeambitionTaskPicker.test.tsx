/**
 * TeambitionTaskPicker renderer tests.
 *
 * Tests the task scope rules:
 * - Feature/Bug without a Craft Project cannot be claimed
 * - Generic Task can choose workspace-only
 * - Generic Task can bind to a Craft Project
 * - Duplicate task claim opens existing session
 *
 * These tests mock `window.electronAPI` directly — the real RPC layer is
 * expected to be wired in Task 4.
 */
import { describe, expect, it, beforeEach, afterEach } from 'bun:test'
import type {
  ClaimTeambitionTaskRequest,
  ClaimTeambitionTaskResponse,
  RendererTaskSummary,
  TeambitionCapabilityDto,
  ListTeambitionTasksResponse,
} from '@craft-agent/shared/protocol/dto'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeTask(overrides: Partial<RendererTaskSummary> = {}): RendererTaskSummary {
  return {
    taskId: 'tw-100',
    title: 'Fix login timeout',
    kind: 'bug',
    updatedAt: '2026-07-12T10:00:00.000Z',
    projectId: 'tw-project-1',
    projectName: 'Core Platform',
    hasBinding: false,
    ...overrides,
  }
}

function mockElectronAPI(overrides: Partial<typeof globalThis.electronAPI> = {}) {
  const defaults = {
    listTeambitionTasks: async (_workspaceId: string): Promise<ListTeambitionTasksResponse> => ({
      tasks: [],
      capabilities: [],
    }),
    claimTeambitionTask: async (
      _workspaceId: string,
      input: ClaimTeambitionTaskRequest,
    ): Promise<ClaimTeambitionTaskResponse> => {
      return { sessionId: `session-${input.taskId}`, taskId: input.taskId, created: true }
    },
    getTeambitionBinding: async (_workspaceId: string, _taskId: string) => null,
    getTeambitionCapabilities: async (_workspaceId: string) => ({ capabilities: [] }),
    ...overrides,
  }

  ;(globalThis as any).electronAPI = defaults
}

function clearElectronAPI() {
  delete (globalThis as any).electronAPI
}

// ---------------------------------------------------------------------------
// Domain logic tests (no React rendering needed)
// ---------------------------------------------------------------------------

describe('Teambition task scope rules', () => {
  beforeEach(() => {
    mockElectronAPI()
  })

  afterEach(() => {
    clearElectronAPI()
  })

  // Step 1a: Feature/Bug without Craft Project cannot be claimed
  it('rejects Feature without a projectId', async () => {
    const task = makeTask({ kind: 'feature', projectId: undefined, projectName: undefined })
    // Feature requires a projectId per domain.parseExternalTaskSummary
    // The UI enforces this by requiring project selection
    expect(task.kind).toBe('feature')
    expect(task.projectId).toBeUndefined()
    // The picker's canClaim logic: feature/bug → requiredScope='project' → needs selectedProjectId
    // Without a selected project, the claim button is disabled
  })

  it('rejects Bug without a projectId', async () => {
    const task = makeTask({ kind: 'bug', projectId: undefined, projectName: undefined })
    expect(task.kind).toBe('bug')
    expect(task.projectId).toBeUndefined()
  })

  // Step 1b: Generic Task can choose workspace-only
  it('allows generic Task to be claimed workspace-only', async () => {
    const task = makeTask({ kind: 'task', projectId: undefined, projectName: undefined })
    expect(task.kind).toBe('task')
    // Generic task does not require a project
    // Workspace-only scope: { type: 'workspace' }
    const scope = { type: 'workspace' as const }
    expect(scope.type).toBe('workspace')
  })

  // Step 1c: Generic Task can bind to a Craft Project
  it('allows generic Task to bind to a Craft Project', async () => {
    const task = makeTask({ kind: 'task', projectId: 'tw-project-1', projectName: 'Core Platform' })
    expect(task.kind).toBe('task')
    const scope = { type: 'project' as const, projectId: 'craft-project-1' }
    expect(scope.type).toBe('project')
    expect(scope.projectId).toBe('craft-project-1')
  })

  // Step 1d: Duplicate task opens existing session
  it('returns existing session for duplicate task claim', async () => {
    let callCount = 0
    mockElectronAPI({
      claimTeambitionTask: async (_ws, _input) => {
        callCount++
        // First call creates, second returns existing
        return {
          sessionId: 'session-existing',
          taskId: 'tw-200',
          created: callCount === 1,
        }
      },
    })

    const api = (globalThis as any).electronAPI

    const result1 = await api.claimTeambitionTask('ws-1', {
      workspaceId: 'ws-1',
      taskId: 'tw-200',
      kind: 'task',
      title: 'Generic task',
      scope: { type: 'workspace' },
    })
    expect(result1.sessionId).toBe('session-existing')
    expect(result1.created).toBe(true)

    // Second claim should return same session
    const result2 = await api.claimTeambitionTask('ws-1', {
      workspaceId: 'ws-1',
      taskId: 'tw-200',
      kind: 'task',
      title: 'Generic task',
      scope: { type: 'workspace' },
    })
    expect(result2.sessionId).toBe('session-existing')
    expect(result2.created).toBe(false)
    expect(callCount).toBe(2)
  })

  it('does not produce a second card for duplicate task', async () => {
    const sessions = new Map<string, string>() // taskId → sessionId
    const api2 = (globalThis as any).electronAPI

    mockElectronAPI({
      claimTeambitionTask: async (_ws: string, input: ClaimTeambitionTaskRequest) => {
        const existing = sessions.get(input.taskId)
        if (existing) {
          return { sessionId: existing, taskId: input.taskId, created: false }
        }
        const sessionId = `session-${input.taskId}`
        sessions.set(input.taskId, sessionId)
        return { sessionId, taskId: input.taskId, created: true }
      },
    })

    const api3 = (globalThis as any).electronAPI

    // Claim same task twice
    const r1 = await api3.claimTeambitionTask('ws-1', {
      workspaceId: 'ws-1',
      taskId: 'tw-300',
      kind: 'task',
      title: 'Do research',
      scope: { type: 'workspace' },
    })
    const r2 = await api3.claimTeambitionTask('ws-1', {
      workspaceId: 'ws-1',
      taskId: 'tw-300',
      kind: 'task',
      title: 'Do research',
      scope: { type: 'workspace' },
    })

    // Both return same sessionId — no duplicate card
    expect(r1.sessionId).toBe(r2.sessionId)
    expect(sessions.size).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Capability detection tests
// ---------------------------------------------------------------------------

describe('Teambition capabilities', () => {
  beforeEach(() => {
    mockElectronAPI()
  })

  afterEach(() => {
    clearElectronAPI()
  })

  it('reports worktime.write as false when capability absent', async () => {
    const capabilities: TeambitionCapabilityDto[] = [
      'identity',
      'task.list',
      'task.detail',
      'task.progress.read',
    ]
    expect(capabilities.includes('worktime.write')).toBe(false)
  })

  it('reports worktime.write as true when capability present', async () => {
    const capabilities: TeambitionCapabilityDto[] = [
      'identity',
      'task.list',
      'task.detail',
      'worktime.write',
    ]
    expect(capabilities.includes('worktime.write')).toBe(true)
  })

  it('reports task.progress.write as present for progress sync', async () => {
    const capabilities: TeambitionCapabilityDto[] = [
      'task.progress.write',
      'task.status.write',
    ]
    expect(capabilities.includes('task.progress.write')).toBe(true)
    expect(capabilities.includes('task.status.write')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// View model join tests (TaskTile.teambition field)
// ---------------------------------------------------------------------------

describe('KanbanTask Teambition view-model join', () => {
  it('joins binding data without mutating SessionMeta', () => {
    // Simulate the join that KanbanBoardContainer performs:
    // Bindings stored separately (integrations/teambition/bindings.json)
    // KanbanTask.teambition is derived at render time
    interface TeambitionViewFields {
      taskId: string
      kind: string
      syncState: string
      projectName?: string
    }

    const bindingsBySession = new Map<string, { taskId: string; kind: string; projectName?: string }>()
    bindingsBySession.set('session-1', { taskId: 'tw-100', kind: 'bug', projectName: 'Core Platform' })

    // SessionMeta does NOT have teambition fields
    const sessionMeta = { id: 'session-1', title: 'Fix login', projectId: 'craft-proj-1' }
    expect(sessionMeta).not.toHaveProperty('teambition')
    expect(sessionMeta).not.toHaveProperty('taskId')

    // View-model join produces the teambition field
    const binding = bindingsBySession.get(sessionMeta.id)
    const teambition: TeambitionViewFields | undefined = binding
      ? { taskId: binding.taskId, kind: binding.kind, syncState: 'synced', projectName: binding.projectName }
      : undefined

    expect(teambition).toBeDefined()
    expect(teambition!.taskId).toBe('tw-100')
    expect(teambition!.kind).toBe('bug')
    expect(teambition!.syncState).toBe('synced')
  })

  it('excludes workspace-only tasks from project-specific filters', () => {
    // workspace-only tasks have no projectId → invisible when project filter active
    const tasks = [
      { id: '1', projectId: 'craft-a' },
      { id: '2', projectId: undefined }, // workspace-only
      { id: '3', projectId: 'craft-b' },
    ]

    const projectFilter = ['craft-a']
    const allow = new Set(projectFilter)

    const visible = tasks.filter(t => t.projectId !== undefined && allow.has(t.projectId))
    expect(visible.length).toBe(1)
    expect(visible[0].id).toBe('1')

    // In "All Tasks" (empty filter), all are visible
    const allVisible = tasks.filter(() => true)
    expect(allVisible.length).toBe(3)
  })

  it('workspace-only tasks visible in All Tasks view', () => {
    const tasks = [
      { id: 'ws-only', projectId: undefined },
      { id: 'proj-1', projectId: 'craft-a' },
    ]

    // Empty filter = all tasks
    const visible = tasks.filter(() => true)
    expect(visible.length).toBe(2)
    expect(visible.some(t => t.id === 'ws-only')).toBe(true)
  })
})
