/**
 * Persistent memory types — Hermes-style USER.md / MEMORY.md / PROJECT.md.
 */

export type MemoryTarget = 'user' | 'soul' | 'memory' | 'project' | 'daily';

export type MemoryAction = 'add' | 'replace' | 'remove';

export interface MemoryOperation {
  action: MemoryAction;
  target: MemoryTarget;
  /** Section heading or bullet to replace/remove; for add, optional subsection. */
  key?: string;
  content: string;
}

export interface MemoryOperationResult {
  ok: boolean;
  target: MemoryTarget;
  action: MemoryAction;
  message: string;
  bytesAfter?: number;
}

export interface MemorySnapshot {
  userMd: string;
  soulMd: string;
  memoryMd: string;
  projectMd: string;
  /** Today's daily journal (when dailyMemory enabled). */
  dailyTodayMd?: string;
  dailyTodayDate?: string;
  /** Yesterday's daily journal (when dailyMemory enabled). */
  dailyYesterdayMd?: string;
  dailyYesterdayDate?: string;
  capturedAt: number;
}

export interface LoadMemorySnapshotOptions {
  dailyMemory?: boolean;
}

/** Max bytes per memory file write. */
export const MEMORY_FILE_MAX_BYTES = 32_000;

/** Max single operation content length. */
export const MEMORY_OPERATION_MAX_CHARS = 4_000;
