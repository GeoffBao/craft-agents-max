import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  shouldRunHeartbeat,
  recordHeartbeatRun,
  DEFAULT_HEARTBEAT_MIN_INTERVAL_MS,
} from '../heartbeat.ts';

describe('heartbeat cost guard', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'craft-hb-'));
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  test('allows first run then blocks within interval', () => {
    expect(shouldRunHeartbeat(workspaceRoot)).toBe(true);
    recordHeartbeatRun(workspaceRoot, 1_000_000);
    expect(shouldRunHeartbeat(workspaceRoot, DEFAULT_HEARTBEAT_MIN_INTERVAL_MS, 1_000_000 + 1000)).toBe(false);
    expect(shouldRunHeartbeat(workspaceRoot, DEFAULT_HEARTBEAT_MIN_INTERVAL_MS, 1_000_000 + DEFAULT_HEARTBEAT_MIN_INTERVAL_MS)).toBe(true);
  });
});
