import { describe, it, expect } from 'bun:test'
import { selectFallbackConnectionSlug, type FallbackCandidate } from './fallback-selection'

const c = (slug: string, isAuthenticated = true): FallbackCandidate => ({ slug, isAuthenticated })

describe('selectFallbackConnectionSlug', () => {
  it('picks the first other authenticated connection (auto, no chain)', () => {
    const ordered = [c('kimi'), c('claude'), c('gpt')]
    expect(selectFallbackConnectionSlug(ordered, 'kimi', new Set())).toBe('claude')
  })

  it('skips the current connection', () => {
    const ordered = [c('claude'), c('kimi')]
    expect(selectFallbackConnectionSlug(ordered, 'claude', new Set())).toBe('kimi')
  })

  it('skips already-attempted connections (cycles forward)', () => {
    const ordered = [c('kimi'), c('claude'), c('gpt')]
    expect(selectFallbackConnectionSlug(ordered, 'kimi', new Set(['kimi', 'claude']))).toBe('gpt')
  })

  it('skips unauthenticated connections', () => {
    const ordered = [c('kimi'), c('claude', false), c('gpt')]
    expect(selectFallbackConnectionSlug(ordered, 'kimi', new Set())).toBe('gpt')
  })

  it('returns undefined when the chain is exhausted', () => {
    const ordered = [c('kimi'), c('claude')]
    expect(selectFallbackConnectionSlug(ordered, 'kimi', new Set(['kimi', 'claude']))).toBeUndefined()
  })

  it('returns undefined when only the current connection exists', () => {
    expect(selectFallbackConnectionSlug([c('kimi')], 'kimi', new Set())).toBeUndefined()
  })

  it('honors explicit chain order as provided by the caller', () => {
    // Caller pre-orders by defaults.fallbackConnections; selection respects it.
    const explicitOrdered = [c('gpt'), c('claude')]
    expect(selectFallbackConnectionSlug(explicitOrdered, 'kimi', new Set())).toBe('gpt')
  })

  it('treats none-auth (e.g. local Ollama) candidates as usable when marked authenticated', () => {
    const ordered = [c('kimi'), c('ollama-local', true)]
    expect(selectFallbackConnectionSlug(ordered, 'kimi', new Set())).toBe('ollama-local')
  })
})
