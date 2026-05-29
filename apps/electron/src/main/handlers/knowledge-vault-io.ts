import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import { getKnowledgeVaultPath } from '../knowledge-bootstrap'

export interface BookEntry {
  relativePath: string
  title: string
  author: string
  cover?: string
  progress?: string
  lastReadDate?: string
  source: 'weread' | 'readwise' | 'apple-books'
}

export interface VaultFileEntry {
  relativePath: string
  name: string
  kind: 'canvas' | 'excalidraw'
}

function* walkFiles(dir: string, ext: string): Generator<string> {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      yield* walkFiles(full, ext)
    } else if (entry.isFile() && entry.name.endsWith(ext)) {
      yield full
    }
  }
}

function parseBookFile(absolutePath: string, vaultRoot: string, source: BookEntry['source']): BookEntry | null {
  let raw: string
  try {
    raw = fs.readFileSync(absolutePath, 'utf-8')
  } catch {
    return null
  }
  const relativePath = path.relative(vaultRoot, absolutePath).replace(/\\/g, '/')
  let data: Record<string, unknown> = {}
  try {
    data = matter(raw).data as Record<string, unknown>
  } catch {
    return null
  }
  const title = typeof data.title === 'string' ? data.title : path.basename(absolutePath, '.md')
  const author = typeof data.author === 'string' ? data.author : ''
  return {
    relativePath,
    title,
    author,
    cover: typeof data.cover === 'string' ? data.cover : undefined,
    progress: typeof data.progress === 'string' ? data.progress : undefined,
    lastReadDate: typeof data.lastReadDate === 'string' ? data.lastReadDate : undefined,
    source,
  }
}

export function listBooks(): BookEntry[] {
  const vaultRoot = getKnowledgeVaultPath()
  const books: BookEntry[] = []
  const sources: Array<{ dir: string; source: BookEntry['source'] }> = [
    { dir: path.join(vaultRoot, 'Raw/weread'), source: 'weread' },
    { dir: path.join(vaultRoot, 'Raw/readwise'), source: 'readwise' },
  ]
  for (const { dir, source } of sources) {
    if (!fs.existsSync(dir)) continue
    for (const filePath of walkFiles(dir, '.md')) {
      const entry = parseBookFile(filePath, vaultRoot, source)
      if (entry) books.push(entry)
    }
  }
  return books.sort((a, b) => {
    const da = a.lastReadDate ?? ''
    const db = b.lastReadDate ?? ''
    return db.localeCompare(da)
  })
}

export function listVaultDiagramFiles(): VaultFileEntry[] {
  const vaultRoot = getKnowledgeVaultPath()
  const entries: VaultFileEntry[] = []
  const roots: Array<{ dir: string; kind: VaultFileEntry['kind']; ext: string }> = [
    { dir: path.join(vaultRoot, 'Diagrams'), kind: 'canvas', ext: '.canvas' },
    { dir: path.join(vaultRoot, 'Excalidraw'), kind: 'excalidraw', ext: '.excalidraw' },
  ]
  for (const { dir, kind, ext } of roots) {
    if (!fs.existsSync(dir)) continue
    for (const filePath of walkFiles(dir, ext)) {
      const relativePath = path.relative(vaultRoot, filePath).replace(/\\/g, '/')
      entries.push({ relativePath, name: path.basename(filePath), kind })
    }
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name))
}

export function readVaultFile(relativePath: string): string | null {
  const vaultRoot = getKnowledgeVaultPath()
  const normalized = relativePath.replace(/\\/g, '/')
  if (normalized.includes('..')) return null
  const absolute = path.join(vaultRoot, normalized)
  if (!absolute.startsWith(vaultRoot)) return null
  try {
    return fs.readFileSync(absolute, 'utf-8')
  } catch {
    return null
  }
}
