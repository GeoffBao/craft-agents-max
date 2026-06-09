/**
 * Heartbeat checklist — OpenClaw-style HEARTBEAT.md without messaging UX.
 *
 * Read-only checklist consumed by SchedulerTick automations.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

export const HEARTBEAT_FILENAME = 'HEARTBEAT.md';

export function getHeartbeatPath(workspaceRootPath: string): string {
  return join(workspaceRootPath, '.craft', HEARTBEAT_FILENAME);
}

export function loadHeartbeatChecklist(workspaceRootPath: string): string | null {
  const path = getHeartbeatPath(workspaceRootPath);
  if (!existsSync(path)) return null;
  return readFileSync(path, 'utf-8');
}

/** Seed .craft/HEARTBEAT.md when heartbeat is enabled and file is missing. */
export function ensureHeartbeatChecklist(workspaceRootPath: string): void {
  const path = getHeartbeatPath(workspaceRootPath);
  if (existsSync(path)) return;
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(path, DEFAULT_HEARTBEAT_TEMPLATE, 'utf-8');
}

export const DEFAULT_HEARTBEAT_TEMPLATE = `# Heartbeat Checklist

Run on SchedulerTick (read-only by default). Keep items short and actionable.

- [ ] Check open sessions for stalled tool runs
- [ ] Scan recent CI / build failures in this workspace
- [ ] Review automations that fired errors in the last 24h
- [ ] Flag sessions with permission prompts still pending

Cost guard: respect workspace agentLearning.heartbeat budget; skip if last run < 1h ago.
`;

export function buildHeartbeatAutomationPrompt(workspaceRootPath: string): string | null {
  const checklist = loadHeartbeatChecklist(workspaceRootPath);
  if (!checklist?.trim()) return null;

  return `<heartbeat_checklist>
Review the following workspace checklist. Report findings only — do not mutate files unless explicitly asked.

${checklist.trim()}
</heartbeat_checklist>`;
}
