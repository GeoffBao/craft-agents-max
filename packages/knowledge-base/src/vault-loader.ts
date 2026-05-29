import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import type { VaultDocument, VaultSection, BacklinkMap } from './types.ts';

const WIKILINK_RE = /\[\[([^\]|^]+)/g;

function detectSection(relativePath: string): VaultSection {
  const first = relativePath.split('/')[0] ?? '';
  const map: Record<string, VaultSection> = {
    Wiki: 'Wiki',
    Notes: 'Notes',
    Raw: 'Raw',
    Journey: 'Journey',
    Projects: 'Projects',
    Diagrams: 'Diagrams',
    Excalidraw: 'Excalidraw',
    Library: 'Library',
  };
  return map[first] ?? 'other';
}

function extractWikilinks(content: string): string[] {
  const links: string[] = [];
  let match: RegExpExecArray | null;
  const re = new RegExp(WIKILINK_RE.source, 'g');
  while ((match = re.exec(content)) !== null) {
    const raw = match[1];
    if (!raw) continue;
    // strip pipe alias and anchor
    const link = raw.split('|')[0]?.split('^')[0]?.trim();
    if (link) links.push(link);
  }
  return [...new Set(links)];
}

// Matches WIPA's stripMarkdown — replaces wikilinks, headings, emphasis, tables, embeds, links
function stripMarkdown(text: string): string {
  return text
    .replace(/\[\[([^\]|]+)\|?([^\]]*)\]\]/g, (_, t: string, d: string) => d || t)
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1')
    .replace(/`[^`]+`/g, '')
    .replace(/^>\s+.*/gm, '')
    .replace(/\|[^|\n]+\|/g, '')
    .replace(/!\[\[[^\]]+\]\]/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/-{3,}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTitle(frontmatter: Record<string, unknown>, relativePath: string): string {
  if (typeof frontmatter['title'] === 'string' && frontmatter['title']) {
    return frontmatter['title'];
  }
  return path.basename(relativePath, '.md');
}

function extractTags(frontmatter: Record<string, unknown>): string[] {
  const raw = frontmatter['tags'];
  if (!raw) return [];
  if (typeof raw === 'string') return raw.split(/[,\s]+/).filter(Boolean);
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  return [];
}

function countWords(text: string): number {
  const cjkCount = (text.match(/[一-鿿぀-ヿ가-힯]/g) ?? []).length;
  const latinCount = (text.match(/\b[a-zA-Z0-9]+\b/g) ?? []).length;
  return cjkCount + latinCount;
}

export function parseMarkdownFile(absolutePath: string, vaultRoot: string): VaultDocument | null {
  let raw: string;
  try {
    raw = fs.readFileSync(absolutePath, 'utf-8');
  } catch {
    return null;
  }

  let parsed: matter.GrayMatterFile<string>;
  try {
    parsed = matter(raw);
  } catch {
    parsed = { data: {}, content: raw } as matter.GrayMatterFile<string>;
  }

  const relativePath = path.relative(vaultRoot, absolutePath).replace(/\\/g, '/');
  const frontmatter = parsed.data as Record<string, unknown>;
  const body = parsed.content ?? '';
  const bodyText = stripMarkdown(body);

  const stat = fs.statSync(absolutePath);

  return {
    id: relativePath,
    title: extractTitle(frontmatter, relativePath),
    path: absolutePath,
    relativePath,
    section: detectSection(relativePath),
    tags: extractTags(frontmatter),
    frontmatter,
    body,
    bodyText,
    wikilinks: extractWikilinks(body),
    wordCount: countWords(bodyText),
    updatedAt: stat.mtimeMs,
  };
}

function* walkDir(dir: string): Generator<string> {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkDir(full);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      yield full;
    }
  }
}

export interface LoadVaultOptions {
  sections?: string[]
  excludePatterns?: RegExp[]
}

export function loadVault(
  vaultRoot: string,
  options: LoadVaultOptions = {}
): { documents: VaultDocument[]; backlinkMap: BacklinkMap } {
  const { sections, excludePatterns = [] } = options;

  const documents: VaultDocument[] = [];
  const titleToIds = new Map<string, string[]>();

  let roots: string[];
  if (sections && sections.length > 0) {
    roots = sections.map((s) => path.join(vaultRoot, s)).filter((p) => fs.existsSync(p));
  } else {
    roots = [vaultRoot];
  }

  for (const root of roots) {
    for (const filePath of walkDir(root)) {
      const relativePath = path.relative(vaultRoot, filePath).replace(/\\/g, '/');

      if (excludePatterns.some((re) => re.test(relativePath))) continue;

      const doc = parseMarkdownFile(filePath, vaultRoot);
      if (!doc) continue;

      documents.push(doc);

      const titleLower = doc.title.toLowerCase();
      const existing = titleToIds.get(titleLower) ?? [];
      existing.push(doc.id);
      titleToIds.set(titleLower, existing);
    }
  }

  const backlinkMap: BacklinkMap = {};
  for (const doc of documents) {
    for (const link of doc.wikilinks) {
      const key = link.toLowerCase();
      if (!backlinkMap[key]) backlinkMap[key] = [];
      if (!backlinkMap[key]!.includes(doc.id)) {
        backlinkMap[key]!.push(doc.id);
      }
    }
  }

  return { documents, backlinkMap };
}

export function getExcerpt(bodyText: string, query: string, maxLen = 200): string {
  const lower = bodyText.toLowerCase();
  const queryLower = query.toLowerCase();
  const idx = lower.indexOf(queryLower);
  if (idx === -1) {
    return bodyText.slice(0, maxLen) + (bodyText.length > maxLen ? '…' : '');
  }
  const start = Math.max(0, idx - 60);
  const end = Math.min(bodyText.length, idx + queryLower.length + 140);
  const excerpt = (start > 0 ? '…' : '') + bodyText.slice(start, end) + (end < bodyText.length ? '…' : '');
  return excerpt;
}
