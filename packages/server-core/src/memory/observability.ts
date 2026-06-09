/**
 * Local JSONL observability log for agent-learning events.
 */

import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { CONFIG_DIR } from '@craft-agent/shared/config';

export type ObservabilityEventType =
  | 'memory_write'
  | 'session_search'
  | 'skill_draft'
  | 'compression_analysis'
  | 'learning_nudge'
  | 'heartbeat'
  | 'compaction_flush';

export interface ObservabilityEvent {
  type: ObservabilityEventType;
  sessionId?: string;
  workspaceId?: string;
  payload?: Record<string, unknown>;
  timestamp: number;
}

function getLogPath(): string {
  return join(CONFIG_DIR, 'logs', 'agent-learning.jsonl');
}

export function logAgentLearningEvent(event: Omit<ObservabilityEvent, 'timestamp'>): void {
  const path = getLogPath();
  const dir = join(path, '..');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const line = JSON.stringify({ ...event, timestamp: Date.now() });
  appendFileSync(path, `${line}\n`, 'utf-8');
}
