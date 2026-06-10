import { isFilePathTarget } from './linkify'

export type ResolvedMarkdownLinkTarget =
  | { kind: 'file'; path: string }
  | { kind: 'url'; url: string }

function normalizeFileUrlPath(path: string): string {
  return /^\/[A-Za-z]:\//.test(path) ? path.slice(1) : path
}

function resolveFileUrlPath(target: string): string | null {
  if (!/^file:/i.test(target)) return null

  try {
    const parsed = new URL(target)
    if (parsed.protocol !== 'file:') return null

    const pathname = decodeURIComponent(parsed.pathname || '')
    if (!pathname && !parsed.hostname) return null

    if (parsed.hostname) {
      const hostname = decodeURIComponent(parsed.hostname)
      return normalizeFileUrlPath(`//${hostname}${pathname}`)
    }

    return normalizeFileUrlPath(pathname)
  } catch {
    return null
  }
}

/**
 * Resolve an Obsidian URI (obsidian://open?path=…) to a local filesystem path.
 *
 * Only `path` values that are filesystem-resolvable (absolute, `~/`, or a
 * Windows drive path) are returned — vault-relative `path`/`file` params can't
 * be resolved without knowing the vault root, so those fall through to the
 * external-URL route (macOS hands them to Obsidian).
 */
function resolveObsidianUrlPath(target: string): string | null {
  if (!/^obsidian:/i.test(target)) return null

  try {
    const parsed = new URL(target)
    if (parsed.protocol !== 'obsidian:') return null

    const path = parsed.searchParams.get('path')
    if (!path) return null

    if (path.startsWith('/') || path.startsWith('~/') || /^[A-Za-z]:[\\/]/.test(path)) {
      return path
    }
    return null
  } catch {
    return null
  }
}

/**
 * Resolve markdown link targets for click dispatch.
 *
 * - Raw filesystem paths are routed through onFileClick
 * - Explicit file:// URLs are normalized to filesystem paths and also routed through onFileClick
 * - Obsidian URIs carrying an absolute `path` param are routed through onFileClick
 *   so notes preview in-app instead of launching Obsidian
 * - Everything else is treated as a URL and routed through onUrlClick
 */
export function resolveMarkdownLinkTarget(target: string): ResolvedMarkdownLinkTarget {
  const trimmed = target.trim()

  const fileUrlPath = resolveFileUrlPath(trimmed)
  if (fileUrlPath) {
    return { kind: 'file', path: fileUrlPath }
  }

  const obsidianPath = resolveObsidianUrlPath(trimmed)
  if (obsidianPath) {
    return { kind: 'file', path: obsidianPath }
  }

  if (isFilePathTarget(trimmed)) {
    return { kind: 'file', path: trimmed }
  }

  return { kind: 'url', url: trimmed }
}

/**
 * Backward-compatible classifier for tests and existing callers that only need the kind.
 */
export function classifyMarkdownLinkTarget(target: string): 'file' | 'url' {
  return resolveMarkdownLinkTarget(target).kind
}
