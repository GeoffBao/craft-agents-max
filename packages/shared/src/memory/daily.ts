/**
 * Daily journal memory — workspace-scoped YYYY-MM-DD.md files.
 */

import { join } from 'path';
import { getWorkspaceMemoryDir } from './storage.ts';

/** Format a Date as local YYYY-MM-DD. */
export function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getDailyMemoryDir(workspaceRootPath: string): string {
  return join(getWorkspaceMemoryDir(workspaceRootPath), 'daily');
}

export function getDailyMemoryPath(workspaceRootPath: string, dateKey: string): string {
  return join(getDailyMemoryDir(workspaceRootPath), `${dateKey}.md`);
}

export function getTodayDateKey(now = new Date()): string {
  return formatDateKey(now);
}

export function getYesterdayDateKey(now = new Date()): string {
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  return formatDateKey(yesterday);
}
