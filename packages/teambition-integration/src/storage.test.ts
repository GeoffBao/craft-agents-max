import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { ExternalTaskBundle } from './domain'
import {
  appendSyncLog,
  claimBinding,
  findBindingByTaskId,
  loadBindings,
  writeTaskBundle,
} from './index'

function makeBundle(): ExternalTaskBundle {
  return {
    summary: {
      taskId: 'tw-100',
      title: 'Stabilize Teambition sync',
      kind: 'feature',
      projectId: 'tw-project-1',
      updatedAt: '2026-07-12T10:00:00.000Z',
    },
    comments: [
      {
        commentId: 'comment-1',
        content: 'Keep this note verbatim and review https://docs.example.com/runbook?foo=bar today.',
        createdAt: '2026-07-12T10:05:00.000Z',
      },
    ],
    progress: {
      percent: 60,
      updatedAt: '2026-07-12T10:06:00.000Z',
      note: 'Halfway there.',
    },
    binding: {
      projectId: 'tw-project-1',
      scope: { type: 'project', projectId: 'tw-project-1' },
    },
    description: 'Preserve this description verbatim and see https://example.com/spec?token=abc for context.',
    attachments: [
      { name: 'design.pdf', url: 'https://files.example.com/design.pdf' },
      {
        name: 'secret.txt',
        url: 'mcp://teambition/task/tw-100?accessToken=top-secret',
      },
    ],
    sourceMetadata: {
      sourceSlug: 'teambition',
      requestId: 'req-1',
      sourceUrl: 'mcp://teambition/task/tw-100?userToken=shhh',
      note: 'Originated from https://teambition.example.com/tasks/tw-100 and was mirrored locally.',
    },
    agentInstructions: [
      'Follow the source task exactly.',
      'Do not expose credentials.',
    ],
  } as ExternalTaskBundle
}

describe('Teambition storage', () => {
  const roots: string[] = []

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('claims a task idempotently and persists redacted task snapshots plus sync logs', async () => {
    const root = mkdtempSync(join(tmpdir(), 'teambition-storage-'))
    roots.push(root)

    const first = await claimBinding(root, {
      provider: 'teambition',
      taskId: 'tw-100',
      sessionId: 'session-1',
      sourceSlug: 'teambition',
      state: 'claimed',
      claimedAt: '2026-07-12T10:00:00.000Z',
    })
    const second = await claimBinding(root, {
      ...first,
      sessionId: 'session-2',
    })

    expect(second.sessionId).toBe('session-1')
    expect(await findBindingByTaskId(root, 'tw-100')).toEqual(first)

    const bindings = await loadBindings(root)
    expect(bindings).toHaveLength(1)

    const bundle = makeBundle()
    await writeTaskBundle(root, first.sessionId, bundle)
    await appendSyncLog(root, {
      operation: 'task.pull',
      taskId: 'tw-100',
      sessionId: first.sessionId,
      timestamp: '2026-07-12T10:07:00.000Z',
      result: 'ok',
      requestId: 'req-1',
      error: 'authorization=Bearer secret-value',
    })

    const dataDir = join(root, 'sessions', 'session-1', 'data', 'teambition')
    const taskJson = readFileSync(join(dataDir, 'task.json'), 'utf-8')
    const taskMarkdown = readFileSync(join(dataDir, 'task.md'), 'utf-8')
    const syncLog = readFileSync(join(dataDir, 'sync-log.jsonl'), 'utf-8')
    const parsedJson = JSON.parse(taskJson) as Record<string, unknown>

    expect(parsedJson.summary).toMatchObject({
      taskId: 'tw-100',
      title: 'Stabilize Teambition sync',
    })
    expect(taskJson).toContain('Preserve this description verbatim and see [redacted-url] for context.')
    expect(taskJson).toContain('Keep this note verbatim and review [redacted-url] today.')
    expect(taskJson).toContain('design.pdf')
    expect(taskJson).not.toContain('top-secret')
    expect(taskJson).not.toContain('shhh')
    expect(taskJson).not.toContain('https://files.example.com/design.pdf')
    expect(taskJson).not.toContain('https://example.com/spec?token=abc')
    expect(taskJson).not.toContain('https://docs.example.com/runbook?foo=bar')
    expect(taskJson).not.toContain('https://teambition.example.com/tasks/tw-100')
    expect(taskJson).toContain('[redacted-url]')
    expect(taskJson).not.toContain('mcp://teambition/task/tw-100?accessToken=top-secret')

    expect(taskMarkdown).toContain('# Stabilize Teambition sync')
    expect(taskMarkdown).toContain('## Description')
    expect(taskMarkdown).toContain('Preserve this description verbatim and see [redacted-url] for context.')
    expect(taskMarkdown).toContain('## Log/进展')
    expect(taskMarkdown).toContain('Keep this note verbatim and review [redacted-url] today.')
    expect(taskMarkdown).toContain('## Attachments')
    expect(taskMarkdown).toContain('design.pdf')
    expect(taskMarkdown).toContain('## Source metadata')
    expect(taskMarkdown).toContain('- note: Originated from [redacted-url] and was mirrored locally.')
    expect(taskMarkdown).toContain('## Agent instructions')
    expect(taskMarkdown).not.toContain('top-secret')
    expect(taskMarkdown).not.toContain('shhh')
    expect(taskMarkdown).not.toContain('https://files.example.com/design.pdf')
    expect(taskMarkdown).not.toContain('https://example.com/spec?token=abc')
    expect(taskMarkdown).not.toContain('https://docs.example.com/runbook?foo=bar')
    expect(taskMarkdown).not.toContain('https://teambition.example.com/tasks/tw-100')
    expect(taskMarkdown).toContain('[redacted-url]')
    expect(taskMarkdown).not.toContain('mcp://teambition/task/tw-100?accessToken=top-secret')

    const [entry] = syncLog.trim().split('\n')
    expect(entry).toBeDefined()
    expect(entry!).toContain('"operation":"task.pull"')
    expect(entry!).toContain('"requestId":"req-1"')
    expect(entry!).not.toContain('secret-value')
    expect(entry!).not.toContain('authorization')
  })
})
