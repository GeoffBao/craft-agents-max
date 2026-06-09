/**
 * Quota auto-fallback connection selection (pure logic).
 *
 * Extracted from SessionManager so the cycle-forward behavior can be unit-tested
 * without storage/credential side effects. The caller resolves the ordered
 * candidate list (explicit `defaults.fallbackConnections` chain when set,
 * otherwise all connections) and each candidate's authentication state, then
 * this function picks the next usable connection.
 */

export interface FallbackCandidate {
  slug: string
  isAuthenticated: boolean
}

/**
 * Pick the next fallback connection.
 *
 * Walks `ordered` and returns the first candidate that is:
 *   - not the current connection,
 *   - not already attempted this turn,
 *   - authenticated.
 *
 * Returns `undefined` when no candidate qualifies (fallback chain exhausted).
 */
export function selectFallbackConnectionSlug(
  ordered: readonly FallbackCandidate[],
  currentSlug: string | undefined,
  attempted: ReadonlySet<string>,
): string | undefined {
  for (const candidate of ordered) {
    if (candidate.slug === currentSlug) continue
    if (attempted.has(candidate.slug)) continue
    if (candidate.isAuthenticated) return candidate.slug
  }
  return undefined
}
