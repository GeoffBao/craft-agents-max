import { describe, expect, it } from 'bun:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import type { Tool } from '@modelcontextprotocol/sdk/types.js'
import { createUserMcpGateway, type UserMcpGatewayOptions } from './mcp-gateway'
import type { TeambitionCapability, TeambitionGateway } from './gateway'

/* ------------------------------------------------------------------ */
/*  Fake MCP transport helpers                                        */
/* ------------------------------------------------------------------ */

function makeTool(name: string, inputSchema?: Record<string, unknown>): Tool {
  return { name, description: '', inputSchema: (inputSchema ?? { type: 'object', properties: {} }) as Tool['inputSchema'] }
}

const FULL_TOOL_SET: Tool[] = [
  makeTool('get_current_user'),
  makeTool('task_list_v2'),
  makeTool('task_detail_3'),
  makeTool('progress_read_v3'),
  makeTool('progress_create_v2'),
  makeTool('task_update_status'),
  makeTool('comment_add'),
  makeTool('worktime_record'),
]

const NO_WORKTIME_TOOL_SET: Tool[] = FULL_TOOL_SET.filter((t) => t.name !== 'worktime_record')

// Simulated tool call results keyed by tool name
const TOOL_RESULTS: Record<string, unknown> = {
  get_current_user: { userId: 'u-42', displayName: 'Eason', email: 'eason@luxshare.com' },
  task_list_v2: {
    tasks: [
      { id: 'tw-100', title: 'Fix login timeout', projectId: 'proj-1', updatedAt: '2026-07-12T10:00:00.000Z' },
      { id: 'tw-101', title: 'Add export feature', projectId: 'proj-1', updatedAt: '2026-07-12T09:00:00.000Z' },
    ],
  },
  task_detail_3: {
    id: 'tw-100',
    title: 'Fix login timeout',
    projectId: 'proj-1',
    updatedAt: '2026-07-12T10:00:00.000Z',
    description: 'Users cannot log in when token expires.',
    comments: [
      { commentId: 'c-1', content: 'Reproduced on staging', createdAt: '2026-07-12T08:00:00.000Z' },
    ],
    progress: { percent: 30, updatedAt: '2026-07-12T09:00:00.000Z', note: 'Analyzing root cause' },
    attachments: [
      { name: 'logs.txt', url: 'https://files.teambition.com/logs.txt' },
    ],
    sourceMetadata: { sourceSlug: 'teambition', requestId: 'req-task-100' },
    agentInstructions: ['Reproduce with token=abc123', 'Do not expose secrets'],
  },
  progress_read_v3: { percent: 30, updatedAt: '2026-07-12T09:00:00.000Z', note: 'Analyzing root cause' },
  progress_create_v2: { id: 'progress-1', updatedAt: '2026-07-12T11:00:00.000Z' },
  task_update_status: { id: 'tw-100', status: 'in_progress', updatedAt: '2026-07-12T11:05:00.000Z' },
  comment_add: { id: 'comment-2', updatedAt: '2026-07-12T11:10:00.000Z' },
  worktime_record: { id: 'worktime-1', updatedAt: '2026-07-12T11:15:00.000Z' },
}

const AUTH_ERROR_RESULT: Record<string, unknown> = {
  isError: true,
  content: [{ type: 'text', text: 'token expired' }],
}

/**
 * Build a fake MCP Client that returns predetermined tool lists and results.
 */
function createFakeClient(
  toolSet: Tool[],
  results: Record<string, unknown> = TOOL_RESULTS,
): Client {
  const client = new Client(
    { name: 'teambition-test', version: '0.0.0' },
    { capabilities: {} },
  )

  // Override the internal listTools to return our fixture
  ;(client as unknown as Record<string, unknown>).listTools = async () => ({ tools: toolSet })

  // Override the internal callTool to return fixture results
  ;(client as unknown as Record<string, unknown>).callTool = async (params: { name: string; arguments?: Record<string, unknown> }) => {
    const result = results[params.name]
    if (result === undefined) {
      return { isError: true, content: [{ type: 'text', text: `Unknown tool: ${params.name}` }] }
    }
    if (typeof result === 'object' && result !== null && 'isError' in result) {
      return result as { isError: boolean; content: Array<{ type: string; text: string }> }
    }
    return { content: [{ type: 'text', text: JSON.stringify(result) }] }
  }

  return client
}

/** Build options with a fake client factory */
function makeOptions(
  toolSet: Tool[],
  results?: Record<string, unknown>,
): UserMcpGatewayOptions {
  return {
    endpoint: 'https://rd.luxshare.com.cn/api/mcp',
    getToken: async () => 'dummy-token-abc',
    getClient: async () => createFakeClient(toolSet, results),
  }
}

describe('Teambition User MCP gateway', () => {
  /* ----- Step 1: Capability probing ----- */

  it('probes all capabilities from a full tool set', async () => {
    const opts = makeOptions(FULL_TOOL_SET)
    const gateway = await createUserMcpGateway(opts)
    const caps: TeambitionCapability[] = [...gateway.capabilities]
    expect(caps).toContain('identity')
    expect(caps).toContain('task.list')
    expect(caps).toContain('task.detail')
    expect(caps).toContain('task.progress.read')
    expect(caps).toContain('task.progress.write')
    expect(caps).toContain('task.status.write')
    expect(caps).toContain('task.comment.write')
    // worktime.read not detected from worktime_record tool (no separate read tool in fixture)
    expect(caps).not.toContain('worktime.read')
    expect(caps).toContain('worktime.write')
  })

  it('reveals recordWorktime only when worktime.write is probed', async () => {
    const optsWith = makeOptions(FULL_TOOL_SET)
    const gatewayWith = await createUserMcpGateway(optsWith)
    expect(typeof gatewayWith.recordWorktime).toBe('function')

    const optsWithout = makeOptions(NO_WORKTIME_TOOL_SET)
    const gatewayWithout = await createUserMcpGateway(optsWithout)
    expect(gatewayWithout.recordWorktime).toBeUndefined()
  })

  it('matches tool names case-insensitively', async () => {
    const mixedCaseTools: Tool[] = [
      makeTool('Get_Current_User'),
      makeTool('TASK_LIST_v2'),
    ]
    const opts = makeOptions(mixedCaseTools)
    const gateway = await createUserMcpGateway(opts)
    expect(gateway.capabilities).toContain('identity')
    expect(gateway.capabilities).toContain('task.list')
  })

  it('matches tool names with style differences (camelCase vs snake_case)', async () => {
    const ccTools: Tool[] = [
      makeTool('getCurrentUser'),
      makeTool('taskListV2'),
      makeTool('taskDetail3'),
      makeTool('progressReadV3'),
      makeTool('progressCreateV2'),
      makeTool('taskUpdateStatus'),
      makeTool('commentAdd'),
      makeTool('worktimeRecord'),
    ]
    const opts = makeOptions(ccTools, {
      getCurrentUser: TOOL_RESULTS['get_current_user'],
      taskListV2: TOOL_RESULTS['task_list_v2'],
      taskDetail3: TOOL_RESULTS['task_detail_3'],
    })
    const gateway = await createUserMcpGateway(opts)
    expect(gateway.capabilities).toContain('identity')
    expect(gateway.capabilities).toContain('task.list')
    expect(gateway.capabilities).toContain('task.detail')
  })

  /* ----- Step 2: Outcome-based method access ----- */

  it('getCurrentUser returns the current user', async () => {
    const gateway = await createUserMcpGateway(makeOptions(FULL_TOOL_SET))
    const user = await gateway.getCurrentUser()
    expect(user.userId).toBe('u-42')
    expect(user.displayName).toBe('Eason')
    expect(user.email).toBe('eason@luxshare.com')
  })

  it('listMyTasks returns normalized summaries', async () => {
    const gateway = await createUserMcpGateway(makeOptions(FULL_TOOL_SET))
    const tasks = await gateway.listMyTasks({})
    expect(tasks).toHaveLength(2)
    expect(tasks[0]?.taskId).toBe('tw-100')
    expect(tasks[0]?.title).toBe('Fix login timeout')
    expect(tasks[1]?.kind).toBe('task') // default kind
  })

  it('getTaskBundle returns a full task bundle with redacted credentials', async () => {
    const gateway = await createUserMcpGateway(makeOptions(FULL_TOOL_SET))
    const bundle = await gateway.getTaskBundle('tw-100')
    expect(bundle.summary.taskId).toBe('tw-100')
    expect(bundle.summary.title).toBe('Fix login timeout')
    expect(bundle.comments).toHaveLength(1)
    expect(bundle.comments[0]?.content).toBe('Reproduced on staging')
    expect(bundle.progress?.percent).toBe(30)

    // Credential patterns (token=abc123) should be redacted; legitimate text preserved
    expect(bundle.agentInstructions).toBeDefined()
    if (bundle.agentInstructions) {
      // 'Reproduce with token=abc123' → token replaced
      expect(bundle.agentInstructions[0]).toMatch(/\[REDACTED\]/)
      expect(bundle.agentInstructions[0]).not.toMatch(/abc123/)
      // 'Do not expose secrets' is a legitimate instruction, not a credential
      expect(bundle.agentInstructions[1]).toBe('Do not expose secrets')
    }
  })

  it('getTaskBundle returns bundle including progress without progress.read tool', async () => {
    const noProgressReadTools = FULL_TOOL_SET.filter((t) => t.name !== 'progress_read_v3')
    const opts = makeOptions(noProgressReadTools, { ...TOOL_RESULTS })
    const gateway = await createUserMcpGateway(opts)
    // Even without separate progress_read, the bundle from task_detail should include progress
    const bundle = await gateway.getTaskBundle('tw-100')
    expect(bundle.progress).toBeDefined()
    // But probing should not include task.progress.read
    expect(gateway.capabilities).not.toContain('task.progress.read')
    expect(gateway.capabilities).toContain('task.detail')
  })

  /* ----- Step 3: Write methods ----- */

  it('addProgress calls the progress create tool', async () => {
    const gateway = await createUserMcpGateway(makeOptions(FULL_TOOL_SET))
    const result = await gateway.addProgress('tw-100', { percent: 50, note: 'Halfway' })
    expect(result.taskId).toBe('tw-100')
    expect(result.syncedAt).toBeTruthy()
    expect(result.changed).toBe(true)
  })

  it('updateWorkflowStatus calls the status update tool', async () => {
    const gateway = await createUserMcpGateway(makeOptions(FULL_TOOL_SET))
    const result = await gateway.updateWorkflowStatus('tw-100', { status: 'in_progress', note: 'Working' })
    expect(result.taskId).toBe('tw-100')
    expect(result.syncedAt).toBeTruthy()
    expect(result.changed).toBe(true)
  })

  it('addComment calls the comment tool', async () => {
    const gateway = await createUserMcpGateway(makeOptions(FULL_TOOL_SET))
    const result = await gateway.addComment('tw-100', 'Looking into this')
    expect(result.taskId).toBe('tw-100')
    expect(result.syncedAt).toBeTruthy()
    expect(result.changed).toBe(true)
  })

  it('recordWorktime adds worktime when available', async () => {
    const gateway = await createUserMcpGateway(makeOptions(FULL_TOOL_SET))
    const result = await gateway.recordWorktime!('tw-100', { minutes: 60, note: 'Analysis' })
    expect(result.taskId).toBe('tw-100')
    expect(result.changed).toBe(true)
  })

  /* ----- Step 4: Missing capability errors ----- */

  it('addProgress throws when progress.write is missing', async () => {
    const noProgressWrite = FULL_TOOL_SET.filter((t) => t.name !== 'progress_create_v2')
    const gateway = await createUserMcpGateway(makeOptions(noProgressWrite))
    await expect(gateway.addProgress('tw-100', { percent: 50 })).rejects.toThrow(/task\.progress\.write/)
  })

  it('updateWorkflowStatus throws when task.status.write is missing', async () => {
    const noStatusWrite = FULL_TOOL_SET.filter((t) => t.name !== 'task_update_status')
    const gateway = await createUserMcpGateway(makeOptions(noStatusWrite))
    await expect(gateway.updateWorkflowStatus('tw-100', { status: 'done' })).rejects.toThrow(/task\.status\.write/)
  })

  it('addComment throws when task.comment.write is missing', async () => {
    const noCommentWrite = FULL_TOOL_SET.filter((t) => t.name !== 'comment_add')
    const gateway = await createUserMcpGateway(makeOptions(noCommentWrite))
    await expect(gateway.addComment('tw-100', 'Hello')).rejects.toThrow(/task\.comment\.write/)
  })

  it('recordWorktime is undefined when worktime.write is missing', async () => {
    const gateway = await createUserMcpGateway(makeOptions(NO_WORKTIME_TOOL_SET))
    expect(gateway.recordWorktime).toBeUndefined()
  })

  /* ----- Step 5: Read-only matching ----- */

  it('does not automatically call write methods when reads succeed', async () => {
    // Track callTool calls
    const callLog: string[] = []
    const trackingClient = createFakeClient(FULL_TOOL_SET)
    const origCallTool = (trackingClient as unknown as Record<string, unknown>).callTool as (
      params: { name: string },
    ) => Promise<unknown>
    ;(trackingClient as unknown as Record<string, unknown>).callTool = async (params: { name: string }) => {
      callLog.push(params.name)
      return origCallTool(params)
    }

    const opts: UserMcpGatewayOptions = {
      endpoint: 'https://rd.luxshare.com.cn/api/mcp',
      getToken: async () => 'dummy',
      getClient: async () => trackingClient,
    }
    const gateway = await createUserMcpGateway(opts)
    callLog.length = 0 // clear probe calls

    await gateway.listMyTasks({})
    await gateway.getTaskBundle('tw-100')

    // Should only have called read tools
    expect(callLog).not.toContain('progress_create_v2')
    expect(callLog).not.toContain('task_update_status')
    expect(callLog).not.toContain('comment_add')
    expect(callLog).not.toContain('worktime_record')
  })

  /* ----- Step 6: Credential safety ----- */

  it('does not include token in error messages', async () => {
    const opts: UserMcpGatewayOptions = {
      endpoint: 'https://rd.luxshare.com.cn/api/mcp',
      getToken: async () => 'super-secret-token-999',
      getClient: async () => createFakeClient(NO_WORKTIME_TOOL_SET),
    }
    const gateway = await createUserMcpGateway(opts)
    try {
      await gateway.addProgress('tw-100', { percent: 50 })
    } catch (e: unknown) {
      const msg = String(e)
      expect(msg).not.toContain('super-secret-token-999')
      expect(msg).not.toContain('999')
      expect(msg).toContain('task.progress.write')
    }
  })
})

describe('probeCapabilities standalone', () => {
  it('probes capabilities from a tool list, case-insensitively', async () => {
    const { probeCapabilities } = await import('./mcp-gateway')
    const caps = probeCapabilities(FULL_TOOL_SET)
    expect(caps).toContain('identity')
    expect(caps).toContain('task.progress.write')
    expect(caps).toContain('worktime.write')
    // worktime.read not detected from worktime_record; only 1 worktime tool
    expect(caps).not.toContain('worktime.read')
    expect(caps).toHaveLength(8)
  })

  it('probes capabilities from camelCase tool names', async () => {
    const { probeCapabilities } = await import('./mcp-gateway')
    const ccTools: Tool[] = [
      makeTool('getCurrentUser'),
      makeTool('taskListV2'),
      makeTool('progressCreateV2'),
    ]
    const caps = probeCapabilities(ccTools)
    expect(caps).toContain('identity')
    expect(caps).toContain('task.list')
    expect(caps).toContain('task.progress.write')
  })

  it('reports empty capabilities for empty tool list', async () => {
    const { probeCapabilities } = await import('./mcp-gateway')
    expect(probeCapabilities([])).toHaveLength(0)
  })
})
