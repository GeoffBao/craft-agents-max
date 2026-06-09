/**
 * Resolve skill content for skill_view tool (production + .drafts).
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import matter from 'gray-matter';
import { loadSkillBySlug } from '../skills/storage.ts';
import { getWorkspaceSkillsPath } from '../workspaces/storage.ts';

export interface SkillViewPayload {
  slug: string;
  name: string;
  description: string;
  source: string;
  path: string;
  body: string;
  isDraft?: boolean;
}

function loadDraftSkill(workspaceRootPath: string, slug: string): SkillViewPayload | null {
  const skillFile = join(getWorkspaceSkillsPath(workspaceRootPath), '.drafts', slug, 'SKILL.md');
  if (!existsSync(skillFile)) return null;

  const raw = readFileSync(skillFile, 'utf-8');
  const parsed = matter(raw);
  const name = typeof parsed.data.name === 'string' ? parsed.data.name : slug;
  const description = typeof parsed.data.description === 'string' ? parsed.data.description : '';

  return {
    slug,
    name,
    description,
    source: 'workspace-draft',
    path: skillFile,
    body: parsed.content.trim(),
    isDraft: true,
  };
}

export function resolveSkillForView(
  workspaceRootPath: string,
  skillSlug: string,
  projectRoot?: string,
): SkillViewPayload | null {
  const skill = loadSkillBySlug(workspaceRootPath, skillSlug, projectRoot);
  if (skill) {
    return {
      slug: skill.slug,
      name: skill.metadata.name,
      description: skill.metadata.description,
      source: skill.source,
      path: skill.path,
      body: skill.content.trim(),
      isDraft: false,
    };
  }
  return loadDraftSkill(workspaceRootPath, skillSlug);
}
