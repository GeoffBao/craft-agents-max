/**
 * Search MEMORY.md (global long-term memory file).
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { getGlobalMemoryDir } from './storage.ts';

export type MemorySearchTarget = 'memory' | 'project' | 'daily';

export interface MemorySearchHit {
  line: number;
  snippet: string;
  section?: string;
  /** Indexed memory file target (FTS-backed search). */
  target?: MemorySearchTarget;
  /** Relative path or label for the source file. */
  file?: string;
  /** YYYY-MM-DD for daily journal hits. */
  date?: string;
}

export interface MemorySearchResult {
  hits: MemorySearchHit[];
  totalApprox: number;
}

export function searchMemoryMd(query: string, limit = 10): MemorySearchResult {
  const path = join(getGlobalMemoryDir(), 'MEMORY.md');
  if (!existsSync(path)) {
    return { hits: [], totalApprox: 0 };
  }

  const lines = readFileSync(path, 'utf-8').split('\n');
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (terms.length === 0) {
    return { hits: [], totalApprox: 0 };
  }

  let currentSection: string | undefined;
  const hits: MemorySearchHit[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.startsWith('## ')) {
      currentSection = line.slice(3).trim();
    }
    const lower = line.toLowerCase();
    if (!terms.every(t => lower.includes(t))) continue;
    hits.push({
      line: i + 1,
      snippet: line.trim().slice(0, 300),
      section: currentSection,
    });
    if (hits.length >= limit) break;
  }

  return { hits, totalApprox: hits.length };
}
