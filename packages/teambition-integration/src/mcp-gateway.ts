import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { Tool } from '@modelcontextprotocol/sdk/types.js'
import type {
  ExternalTaskBundle,
  ExternalTaskComment,
  ExternalTaskProgress,
  ExternalTaskSummary,
  ListMyTasksInput,
  ProgressInput,
  SyncResult,
  TeambitionUser,
  WorkflowStatusInput,
  WorktimeInput,
} from './domain'
import type { TeambitionCapability, TeambitionGateway } from './gateway'

/* ------------------------------------------------------------------ */
/*  Options & runtime credential provider                              */
/* ------------------------------------------------------------------ */

export interface UserMcpGatewayOptions {
  /** Base endpoint WITHOUT token, e.g. https://rd.luxshare.com.cn/api/mcp */
  endpoint: string
  /** Async provider that returns the current User MCP token (never cached/persisted) */
  getToken: () => Promise<string>
  /**
   * Optional hook for injecting a fake client in tests.
   * When omitted, creates a real StreamableHTTPClientTransport connection.
   */
  getClient?: () => Promise<Client>
}

/* ------------------------------------------------------------------ */
/*  Tool name normalization: case- AND style-insensitive matching      */
/* ------------------------------------------------------------------ */

/**
 * Normalize a tool name for comparison: lowercase, strip all non-alphanumeric
 * characters (underscores, hyphens, dots, slashes). This makes
 * `get_current_user`, `getCurrentUser`, `get-current-user`, and
 * `getCurrentuser` all match the same capability.
 */
export function normalizeToolName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/* ------------------------------------------------------------------ */
/*  Capability probing logic                                           */
/* ------------------------------------------------------------------ */

/**
 * Tool-name patterns for each capability, expressed as normalized substrings.
 * Each entry is a list of patterns — ANY match triggers the capability.
 */
const CAPABILITY_PATTERNS: Record<TeambitionCapability, readonly string[]> = {
  identity: ['getcurrentuser', 'getuser', 'currentuser', 'getcurrentemployee'],
  'task.list': ['tasklist', 'listtask', 'listmytask', 'mytasklist', 'searchtask', 'querytask'],
  'task.detail': ['taskdetail', 'detailtask', 'gettask', 'taskinfo', 'taskv3', 'getprogress3'],
  'task.progress.read': ['progressread', 'readprogress', 'getprogress', 'queryprogress', 'progressv3'],
  'task.progress.write': ['progresscreate', 'createprogress', 'addprogress', 'progressv2', 'writeprogress'],
  'task.status.write': ['updatestatus', 'taskupdatestatus', 'setstatus', 'changestatus', 'updateworkflowstatus'],
  'task.comment.write': ['commentadd', 'addcomment', 'createcomment', 'postcomment'],
  'worktime.read': ['worktimeread', 'readworktime', 'getworktime', 'queryworktime'],
  'worktime.write': ['worktimerecord', 'recordworktime', 'createworktime', 'addworktime', 'worktimecreate'],
}

/**
 * Check whether a tool name matches a list of normalized patterns.
 */
function toolMatchesAny(name: string, patterns: readonly string[]): boolean {
  const normalized = normalizeToolName(name)
  return patterns.some((p) => normalized.includes(p))
}

/**
 * Probe capabilities from a list of MCP Tool definitions.
 * Pure function — no side effects, no I/O.
 */
export function probeCapabilities(tools: Tool[]): readonly TeambitionCapability[] {
  const detected: TeambitionCapability[] = []
  for (const [capability, patterns] of Object.entries(CAPABILITY_PATTERNS)) {
    if (tools.some((tool) => toolMatchesAny(tool.name, patterns))) {
      detected.push(capability as TeambitionCapability)
    }
  }
  return detected
}

/* ------------------------------------------------------------------ */
/*  Error type for missing capabilities                                */
/* ------------------------------------------------------------------ */

export class MissingCapabilityError extends Error {
  readonly capability: TeambitionCapability

  constructor(capability: TeambitionCapability) {
    super(`Teambition capability not available: ${capability}`)
    this.name = 'MissingCapabilityError'
    this.capability = capability
  }
}

/* ------------------------------------------------------------------ */
/*  Credential redaction helper                                        */
/* ------------------------------------------------------------------ */

const CREDENTIAL_PATTERNS = [
  /token\s*[=:]\s*\S+/gi,
  /secret\s*[=:]\s*\S+/gi,
  /authorization\s*[=:]\s*\S+/gi,
  /access[_-]?token\s*[=:]\s*\S+/gi,
  /app[_-]?secret\s*[=:]\s*\S+/gi,
]

function redactCredentials(text: string): string {
  let result = text
  for (const pattern of CREDENTIAL_PATTERNS) {
    result = result.replace(pattern, (match) => {
      const eqIdx = match.indexOf('=')
      const colonIdx = match.indexOf(':')
      const sepIdx = eqIdx >= 0 ? eqIdx : colonIdx
      return sepIdx >= 0 ? match.slice(0, sepIdx + 1) + '[REDACTED]' : '[REDACTED]'
    })
  }
  return result
}

function redactArray(arr: string[]): string[] {
  return arr.map((s) => redactCredentials(s))
}

/* ------------------------------------------------------------------ */
/*  Tool call helpers                                                  */
/* ------------------------------------------------------------------ */

async function callTool<T = Record<string, unknown>>(
  client: Client,
  name: string,
  args?: Record<string, unknown>,
): Promise<T> {
  // We cast because the SDK's callTool returns a slightly different shape
  // than what we need for JSON parsing
  const response = await (client as unknown as {
    callTool(params: { name: string; arguments?: Record<string, unknown> }): Promise<{
      content?: Array<{ type: string; text?: string }>
      isError?: boolean
    }>
  }).callTool({ name, arguments: args })

  if (response.isError) {
    const errorText = response.content?.map((c) => c.text).filter(Boolean).join('; ') || 'Unknown error'
    throw new Error(`Teambition MCP tool error (${name}): ${errorText}`)
  }

  const text = response.content?.find((c) => c.type === 'text')?.text
  if (!text) {
    throw new Error(`Teambition MCP tool returned no text content (${name})`)
  }

  return JSON.parse(text) as T
}

/* ------------------------------------------------------------------ */
/*  Task normalization helpers                                         */
/* ------------------------------------------------------------------ */

/** Keys whose values should never be included in normalized output. */
const CREDENTIAL_KEYS = new Set([
  'userToken', 'user_token', 'accessToken', 'access_token',
  'appSecret', 'app_secret', 'authorization', 'authToken', 'auth_token',
])

function stripCredentials(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (CREDENTIAL_KEYS.has(key)) continue
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      result[key] = stripCredentials(value as Record<string, unknown>)
    } else {
      result[key] = value
    }
  }
  return result
}

function toExternalTaskSummary(raw: Record<string, unknown>): ExternalTaskSummary {
  return {
    taskId: String(raw.id ?? raw.taskId ?? ''),
    title: String(raw.title ?? ''),
    kind: (raw.kind as ExternalTaskSummary['kind']) ?? 'task',
    projectId: raw.projectId ? String(raw.projectId) : undefined,
    updatedAt: String(raw.updatedAt ?? raw.updated_at ?? ''),
  }
}

function toProgress(raw: Record<string, unknown>): ExternalTaskProgress {
  return {
    percent: Number(raw.percent ?? raw.progress ?? 0),
    updatedAt: String(raw.updatedAt ?? raw.updated_at ?? ''),
    note: raw.note ? String(raw.note) : undefined,
  }
}

function toComment(raw: Record<string, unknown>): ExternalTaskComment {
  return {
    commentId: String(raw.commentId ?? raw.id ?? raw.comment_id ?? ''),
    content: String(raw.content ?? ''),
    createdAt: String(raw.createdAt ?? raw.created_at ?? raw.created_at ?? ''),
  }
}

/* ------------------------------------------------------------------ */
/*  Gateway factory                                                    */
/* ------------------------------------------------------------------ */

/**
 * Scan all tools to find one that matches at least one of the given patterns.
 * Returns the first matching tool name, or undefined.
 */
function findToolName(
  tools: Tool[],
  patterns: readonly string[],
): string | undefined {
  return tools.find((tool) => toolMatchesAny(tool.name, patterns))?.name
}

/**
 * Create a TeambitionGateway backed by a User MCP connection.
 *
 * - Makes ONE MCP connection and probes capabilities via tools/list
 * - Tool names are matched case- AND style-insensitively
 * - The raw token is NEVER logged, persisted, or included in error messages
 * - Missing capabilities cause typed MissingCapabilityError
 */
export async function createUserMcpGateway(options: UserMcpGatewayOptions): Promise<TeambitionGateway> {
  const { endpoint, getToken, getClient } = options

  // Construct the authenticated URL only in memory — never log or persist
  const token = await getToken()
  const separator = endpoint.includes('?') ? '&' : '?'
  const authUrl = `${endpoint}${separator}userToken=${encodeURIComponent(token)}`

  let client: Client
  if (getClient) {
    client = await getClient()
  } else {
    client = new Client(
      { name: 'craft-agent-teambition', version: '0.1.0' },
      { capabilities: {} },
    )
    const transport = new StreamableHTTPClientTransport(new URL(authUrl))
    await client.connect(transport)
  }

  // Probe capabilities
  const listResult = await (client as unknown as {
    listTools(): Promise<{ tools: Tool[] }>
  }).listTools()
  const tools = listResult.tools
  const capabilities = probeCapabilities(tools)

  /**
   * Pre-resolve tool names so we don't search every call.
   * Each capability maps to the actual tool name on this server.
   */
  const toolNames = new Map<TeambitionCapability, string | undefined>()
  for (const cap of Object.keys(CAPABILITY_PATTERNS) as TeambitionCapability[]) {
    const patterns = CAPABILITY_PATTERNS[cap]
    toolNames.set(cap, findToolName(tools, patterns))
  }

  /** Helper: assert a capability is available and return its tool name. */
  function requireTool(capability: TeambitionCapability): string {
    const name = toolNames.get(capability)
    if (!name) throw new MissingCapabilityError(capability)
    return name
  }

  /** Extract request ID and updatedAt from raw tool response. */
  function toSyncResult(taskId: string, raw: Record<string, unknown>): SyncResult {
    return {
      taskId,
      syncedAt: String(raw.updatedAt ?? raw.updated_at ?? new Date().toISOString()),
      changed: true,
    }
  }

  const gateway: TeambitionGateway = {
    get capabilities(): readonly TeambitionCapability[] {
      return capabilities
    },

    async getCurrentUser(): Promise<TeambitionUser> {
      const name = requireTool('identity')
      return callTool<TeambitionUser>(client, name)
    },

    async listMyTasks(_input: ListMyTasksInput): Promise<ExternalTaskSummary[]> {
      const name = requireTool('task.list')
      const raw = await callTool<{ tasks?: Record<string, unknown>[] }>(client, name, _input as Record<string, unknown>)
      return (raw.tasks ?? []).map(toExternalTaskSummary)
    },

    async getTaskBundle(taskId: string): Promise<ExternalTaskBundle> {
      const name = requireTool('task.detail')
      const raw = await callTool<Record<string, unknown>>(client, name, { taskId })

      const progressMap = raw.progress as Record<string, unknown> | undefined
      const commentsRaw = raw.comments as Array<Record<string, unknown>> | undefined
      const attachmentsRaw = raw.attachments as Array<Record<string, unknown>> | undefined
      const agentInstructionsRaw = raw.agentInstructions as string[] | undefined
      const sourceMetadataRaw = raw.sourceMetadata as Record<string, unknown> | undefined

      const bundle: ExternalTaskBundle = {
        summary: toExternalTaskSummary(stripCredentials(raw)),
        comments: (commentsRaw ?? []).map(toComment),
        progress: progressMap ? toProgress(progressMap) : undefined,
        description: raw.description ? String(raw.description) : undefined,
        attachments: (attachmentsRaw ?? []).map((a) => stripCredentials(a)),
        sourceMetadata: sourceMetadataRaw ? stripCredentials(sourceMetadataRaw) : undefined,
        agentInstructions: agentInstructionsRaw ? redactArray(agentInstructionsRaw) : undefined,
      }
      return bundle
    },

    async addProgress(taskId: string, input: ProgressInput): Promise<SyncResult> {
      const name = requireTool('task.progress.write')
      const raw = await callTool<Record<string, unknown>>(client, name, { taskId, ...input })
      return toSyncResult(taskId, raw)
    },

    async updateWorkflowStatus(taskId: string, input: WorkflowStatusInput): Promise<SyncResult> {
      const name = requireTool('task.status.write')
      const raw = await callTool<Record<string, unknown>>(client, name, { taskId, ...input })
      return toSyncResult(taskId, raw)
    },

    async addComment(taskId: string, content: string): Promise<SyncResult> {
      const name = requireTool('task.comment.write')
      const raw = await callTool<Record<string, unknown>>(client, name, { taskId, content })
      return toSyncResult(taskId, raw)
    },
  }

  // recordWorktime is only attached when the capability is detected
  if (capabilities.includes('worktime.write')) {
    gateway.recordWorktime = async (taskId: string, input: WorktimeInput): Promise<SyncResult> => {
      const name = requireTool('worktime.write')
      const raw = await callTool<Record<string, unknown>>(client, name, { taskId, ...input })
      return toSyncResult(taskId, raw)
    }
  }

  return gateway
}
