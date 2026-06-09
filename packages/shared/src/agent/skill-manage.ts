/**
 * Skill draft management — patch skills/.drafts/ only (no production writes).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import matter from 'gray-matter';
import { getWorkspaceSkillsPath } from '../workspaces/storage.ts';

export type SkillManageAction = 'append' | 'replace_section';

export interface SkillManageInput {
  workspaceRootPath: string;
  skillSlug: string;
  action: SkillManageAction;
  content: string;
  section?: string;
}

export interface SkillManageResult {
  ok: boolean;
  message: string;
  path?: string;
}

function draftSkillPath(workspaceRootPath: string, slug: string): string {
  return join(getWorkspaceSkillsPath(workspaceRootPath), '.drafts', slug, 'SKILL.md');
}

function appendSection(existing: string, content: string): string {
  return `${existing.trim()}\n\n${content.trim()}\n`;
}

function replaceSection(existing: string, section: string, content: string): string {
  const heading = `## ${section}`;
  const regex = new RegExp(`## ${section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?(?=\\n## |$)`, 'i');
  const block = `${heading}\n${content.trim()}\n`;
  if (regex.test(existing)) {
    return existing.replace(regex, block).trim() + '\n';
  }
  return appendSection(existing, block);
}

export function applySkillDraftManage(input: SkillManageInput): SkillManageResult {
  const slug = input.skillSlug.trim();
  if (!slug) {
    return { ok: false, message: 'skillSlug is required.' };
  }
  if (!input.content.trim()) {
    return { ok: false, message: 'content is required.' };
  }
  if (input.action === 'replace_section' && !input.section?.trim()) {
    return { ok: false, message: 'section is required for replace_section.' };
  }

  const path = draftSkillPath(input.workspaceRootPath, slug);
  if (!existsSync(path)) {
    return {
      ok: false,
      message: `Draft not found at ${path}. Use propose_skill_from_session first.`,
    };
  }

  const raw = readFileSync(path, 'utf-8');
  const parsed = matter(raw);
  let body = parsed.content;

  if (input.action === 'append') {
    body = appendSection(body, input.content);
  } else {
    body = replaceSection(body, input.section!.trim(), input.content);
  }

  const next = matter.stringify(body, parsed.data);
  writeFileSync(path, next, 'utf-8');

  return {
    ok: true,
    message: `Updated draft skill ${slug} (${input.action}).`,
    path,
  };
}
