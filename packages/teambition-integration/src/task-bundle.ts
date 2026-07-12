import { appendFile, mkdir, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ExternalTaskBundle } from './domain'

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

export interface SyncLogEntry {
  operation: string
  taskId: string
  sessionId: string
  timestamp: string
  result: string
  requestId?: string
  error?: string
}

type LooseBundle = ExternalTaskBundle & Record<string, unknown>

const REDACTED = '[REDACTED]'
const REDACTED_MCP_URL = '[REDACTED_MCP_URL]'
const SECRET_PATTERNS = [/userToken/i, /authorization/i, /appSecret/i, /accessToken/i]

function dataDir(workspaceRoot: string, sessionId: string): string {
  return join(workspaceRoot, 'sessions', sessionId, 'data', 'teambition')
}

function toJsonValue(value: unknown): JsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return sanitizeString(value)
  }

  if (Array.isArray(value)) {
    return value.map((item) => toJsonValue(item))
  }

  if (typeof value === 'object' && value) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, toJsonValue(entry)]),
    )
  }

  return String(value)
}

function sanitizeString(value: unknown): JsonValue {
  if (typeof value !== 'string') {
    return value as Exclude<JsonValue, string>
  }

  if (value.startsWith('mcp://')) {
    return REDACTED_MCP_URL
  }

  return SECRET_PATTERNS.some((pattern) => pattern.test(value)) ? REDACTED : value
}

function getOptionalArray(bundle: LooseBundle, key: string): unknown[] {
  const value = bundle[key]
  return Array.isArray(value) ? value : []
}

function getOptionalText(bundle: LooseBundle, key: string): string | undefined {
  const value = bundle[key]
  return typeof value === 'string' && value.trim() ? value : undefined
}

function getOptionalRecord(bundle: LooseBundle, key: string): Record<string, unknown> | undefined {
  const value = bundle[key]
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function renderList(items: string[]): string {
  return items.length > 0 ? items.map((item) => `- ${item}`).join('\n') : '- None'
}

function renderKeyValues(record: Record<string, unknown> | undefined): string {
  if (!record) return '- None'
  const lines = Object.entries(record).map(([key, value]) => `- ${key}: ${String(toJsonValue(value))}`)
  return lines.length > 0 ? lines.join('\n') : '- None'
}

function renderComments(bundle: ExternalTaskBundle): string {
  const commentLines = bundle.comments.map(
    (comment) => `- ${comment.createdAt} ${comment.content}`,
  )
  if (bundle.progress) {
    commentLines.push(
      `- ${bundle.progress.updatedAt} ${bundle.progress.percent}%${bundle.progress.note ? ` — ${bundle.progress.note}` : ''}`,
    )
  }
  return commentLines.length > 0 ? commentLines.join('\n') : '- None'
}

function renderAttachments(bundle: LooseBundle): string {
  const attachments = getOptionalArray(bundle, 'attachments').map((item) =>
    typeof item === 'object' && item
      ? Object.values(item as Record<string, unknown>)
          .map((value) => String(toJsonValue(value)))
          .join(' ')
          .trim()
      : String(toJsonValue(item)),
  )
  return renderList(attachments.filter(Boolean))
}

function renderAgentInstructions(bundle: LooseBundle): string {
  const instructions = getOptionalArray(bundle, 'agentInstructions').map((item) => String(toJsonValue(item)))
  return renderList(instructions.filter(Boolean))
}

function buildMarkdown(bundle: LooseBundle): string {
  const description = getOptionalText(bundle, 'description') ?? '- None'
  const sourceMetadata = getOptionalRecord(bundle, 'sourceMetadata')

  return [
    `# ${bundle.summary.title}`,
    '',
    '## Description',
    description,
    '',
    '## Log/进展',
    renderComments(bundle),
    '',
    '## Attachments',
    renderAttachments(bundle),
    '',
    '## Source metadata',
    renderKeyValues(sourceMetadata),
    '',
    '## Agent instructions',
    renderAgentInstructions(bundle),
    '',
  ]
    .map((line) => String(toJsonValue(line)))
    .join('\n')
}

async function writeAtomic(filePath: string, content: string): Promise<void> {
  const tempPath = `${filePath}.tmp`
  await writeFile(tempPath, content, 'utf-8')
  await rename(tempPath, filePath)
}

export async function writeTaskBundle(
  workspaceRoot: string,
  sessionId: string,
  bundle: ExternalTaskBundle,
): Promise<void> {
  const dir = dataDir(workspaceRoot, sessionId)
  await mkdir(dir, { recursive: true })

  const looseBundle = bundle as LooseBundle
  const sanitizedBundle = toJsonValue(looseBundle)

  await writeAtomic(join(dir, 'task.json'), JSON.stringify(sanitizedBundle, null, 2))
  await writeAtomic(join(dir, 'task.md'), buildMarkdown(looseBundle))
}

export async function appendSyncLog(workspaceRoot: string, entry: SyncLogEntry): Promise<void> {
  const dir = dataDir(workspaceRoot, entry.sessionId)
  await mkdir(dir, { recursive: true })
  const sanitizedEntry = toJsonValue(entry)
  await appendFile(join(dir, 'sync-log.jsonl'), `${JSON.stringify(sanitizedEntry)}\n`, 'utf-8')
}
