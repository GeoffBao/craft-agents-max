import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { listSkillDrafts, promoteSkillDraft, rejectSkillDraft } from '../drafts.ts';
import { getWorkspaceSkillsPath } from '../../workspaces/storage.ts';

describe('skill drafts', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'craft-draft-'));
    mkdirSync(join(workspaceRoot, 'sources'), { recursive: true });
    writeFileSync(join(workspaceRoot, 'config.json'), JSON.stringify({
      id: 'ws1',
      name: 'Test',
      slug: 'test',
      createdAt: 1,
      updatedAt: 1,
    }));
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  test('promote moves draft to production skill path', () => {
    const draftDir = join(getWorkspaceSkillsPath(workspaceRoot), '.drafts', 'my-skill');
    mkdirSync(draftDir, { recursive: true });
    writeFileSync(join(draftDir, 'SKILL.md'), `---
name: My Skill
description: Test draft
---
Body
`);

    expect(listSkillDrafts(workspaceRoot)).toHaveLength(1);
    const result = promoteSkillDraft(workspaceRoot, 'my-skill');
    expect(result.ok).toBe(true);
    expect(existsSync(join(getWorkspaceSkillsPath(workspaceRoot), 'my-skill', 'SKILL.md'))).toBe(true);
    expect(listSkillDrafts(workspaceRoot)).toHaveLength(0);
  });

  test('reject removes draft directory', () => {
    const draftDir = join(getWorkspaceSkillsPath(workspaceRoot), '.drafts', 'drop-me');
    mkdirSync(draftDir, { recursive: true });
    writeFileSync(join(draftDir, 'SKILL.md'), `---
name: Drop
description: Gone
---
`);
    const result = rejectSkillDraft(workspaceRoot, 'drop-me');
    expect(result.ok).toBe(true);
    expect(listSkillDrafts(workspaceRoot)).toHaveLength(0);
  });
});
