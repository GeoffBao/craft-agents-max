/**
 * Skill draft lifecycle — list, promote, reject under skills/.drafts/
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
} from 'fs';
import { join } from 'path';
import matter from 'gray-matter';
import { getWorkspaceSkillsPath } from '../workspaces/storage.ts';
import { skillExists, invalidateSkillsCache } from './storage.ts';

export interface LoadedSkillDraft {
  slug: string;
  path: string;
  metadata: {
    name: string;
    description: string;
  };
  modifiedAt: number;
}

function draftsRoot(workspaceRoot: string): string {
  return join(getWorkspaceSkillsPath(workspaceRoot), '.drafts');
}

export function listSkillDrafts(workspaceRoot: string): LoadedSkillDraft[] {
  const root = draftsRoot(workspaceRoot);
  if (!existsSync(root)) return [];

  const drafts: LoadedSkillDraft[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const skillFile = join(root, entry.name, 'SKILL.md');
    if (!existsSync(skillFile)) continue;
    try {
      const raw = readFileSync(skillFile, 'utf-8');
      const parsed = matter(raw);
      if (!parsed.data.name || !parsed.data.description) continue;
      drafts.push({
        slug: entry.name,
        path: skillFile,
        metadata: {
          name: String(parsed.data.name),
          description: String(parsed.data.description),
        },
        modifiedAt: statSync(skillFile).mtimeMs,
      });
    } catch {
      // skip corrupt draft
    }
  }

  return drafts.sort((a, b) => b.modifiedAt - a.modifiedAt);
}

export function promoteSkillDraft(
  workspaceRoot: string,
  slug: string,
): { ok: boolean; message: string } {
  const draftDir = join(draftsRoot(workspaceRoot), slug);
  const draftFile = join(draftDir, 'SKILL.md');
  if (!existsSync(draftFile)) {
    return { ok: false, message: `Draft not found: ${slug}` };
  }

  if (skillExists(workspaceRoot, slug)) {
    return {
      ok: false,
      message: `Skill "${slug}" already exists. Rename the draft or delete the existing skill first.`,
    };
  }

  const destDir = join(getWorkspaceSkillsPath(workspaceRoot), slug);
  try {
    mkdirSync(getWorkspaceSkillsPath(workspaceRoot), { recursive: true });
    renameSync(draftDir, destDir);
    invalidateSkillsCache();
    return { ok: true, message: `Promoted draft "${slug}" to skills/${slug}/` };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, message: `Promote failed: ${message}` };
  }
}

export function rejectSkillDraft(
  workspaceRoot: string,
  slug: string,
): { ok: boolean; message: string } {
  const draftDir = join(draftsRoot(workspaceRoot), slug);
  if (!existsSync(draftDir)) {
    return { ok: false, message: `Draft not found: ${slug}` };
  }
  try {
    rmSync(draftDir, { recursive: true });
    return { ok: true, message: `Rejected draft "${slug}"` };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, message: `Reject failed: ${message}` };
  }
}
