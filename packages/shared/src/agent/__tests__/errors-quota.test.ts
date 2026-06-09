import { describe, it, expect } from 'bun:test'
import { parseError } from '../errors.ts'

describe('parseError — quota_exhausted classification', () => {
  const quotaMessages = [
    'Error: 429 insufficient_quota',
    'You exceeded your current quota, please check your plan and billing details',
    'quota exceeded for this organization',
    'out of credits',
    'insufficient_balance',
    'Your account balance is insufficient',
    '账户余额不足，请充值',
    '配额不足',
    '当前账户已欠费',
  ]

  for (const msg of quotaMessages) {
    it(`classifies "${msg.slice(0, 40)}" as quota_exhausted`, () => {
      expect(parseError(new Error(msg)).code).toBe('quota_exhausted')
    })
  }

  it('does NOT misclassify a plain 429 rate limit as quota', () => {
    expect(parseError(new Error('429 Too Many Requests: rate limit reached')).code).toBe('rate_limited')
  })

  it('does NOT misclassify a 402 payment error as quota', () => {
    expect(parseError(new Error('402 Payment Required')).code).toBe('billing_error')
  })

  it('quota_exhausted is not auto-retryable on the same connection', () => {
    expect(parseError(new Error('insufficient_quota')).canRetry).toBe(false)
  })
})
