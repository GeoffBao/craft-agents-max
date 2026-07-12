import { describe, expect, it } from 'bun:test'
import { parseExternalTaskSummary, type ExecutionScope, type ExternalTaskSummary } from './domain'

describe('Teambition domain', () => {
  it('represents the workspace execution scope', () => {
    const scope: ExecutionScope = { type: 'workspace' }
    expect(scope).toEqual({ type: 'workspace' })
  })

  it('represents the project execution scope', () => {
    const scope: ExecutionScope = { type: 'project', projectId: 'tw-project-1' }
    expect(scope).toEqual({ type: 'project', projectId: 'tw-project-1' })
  })

  it('accepts a valid feature task with a project binding', () => {
    const input: ExternalTaskSummary = {
      taskId: 'tw-100',
      title: 'Fix login timeout',
      kind: 'feature',
      projectId: 'tw-project-1',
      updatedAt: '2026-07-12T10:00:00.000Z',
    }
    expect(parseExternalTaskSummary(input)).toEqual(input)
  })

  it('accepts a valid bug task with a project binding', () => {
    const input: ExternalTaskSummary = {
      taskId: 'tw-100-bug',
      title: 'Fix login timeout',
      kind: 'bug',
      projectId: 'tw-project-1',
      updatedAt: '2026-07-12T10:00:00.000Z',
    }
    expect(parseExternalTaskSummary(input)).toEqual(input)
  })

  it('accepts a valid generic task without a project binding', () => {
    const input: ExternalTaskSummary = {
      taskId: 'tw-101',
      title: 'General follow-up',
      kind: 'task',
      updatedAt: '2026-07-12T10:00:00.000Z',
    }
    expect(parseExternalTaskSummary(input)).toEqual(input)
  })

  it('accepts a valid generic task with a project binding', () => {
    const input: ExternalTaskSummary = {
      taskId: 'tw-102',
      title: 'General follow-up',
      kind: 'task',
      projectId: 'tw-project-1',
      updatedAt: '2026-07-12T10:00:00.000Z',
    }
    expect(parseExternalTaskSummary(input)).toEqual(input)
  })

  it('rejects a project task without a project binding', () => {
    expect(() =>
      parseExternalTaskSummary({
        taskId: 'tw-101',
        title: 'Add export',
        kind: 'feature',
        updatedAt: '2026-07-12T10:00:00.000Z',
      }),
    ).toThrow()
  })

  it('rejects an empty taskId', () => {
    expect(() =>
      parseExternalTaskSummary({
        taskId: '   ',
        title: 'Add export',
        kind: 'task',
        updatedAt: '2026-07-12T10:00:00.000Z',
      }),
    ).toThrow()
  })

  it('rejects an empty title', () => {
    expect(() =>
      parseExternalTaskSummary({
        taskId: 'tw-103',
        title: '   ',
        kind: 'task',
        updatedAt: '2026-07-12T10:00:00.000Z',
      }),
    ).toThrow()
  })

  it('rejects an empty updatedAt', () => {
    expect(() =>
      parseExternalTaskSummary({
        taskId: 'tw-104',
        title: 'Add export',
        kind: 'task',
        updatedAt: '   ',
      }),
    ).toThrow()
  })
})
