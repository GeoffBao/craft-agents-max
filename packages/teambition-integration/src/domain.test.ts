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
    expect(() =>
      parseExternalTaskSummary({
        taskId: 'tw-101',
        title: 'Add export',
        kind: 'feature',
        updatedAt: '2026-07-12T10:00:00.000Z',
      }),
    ).toThrow()
  })
})
