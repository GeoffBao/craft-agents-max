/**
 * Session Knowledge Write-Back
 *
 * Fires after every successful agent turn. Reads the last assistant message(s),
 * extracts meaningful insights via heuristics, and appends them to
 * {vaultPath}/Journey/YYYY-MM-DD.md — closing the KB ↔ Agent feedback loop.
 *
 * Design constraints:
 * - Fire-and-forget (never blocks the agent turn)
 * - Reads session JSONL directly (no @craft-agent/shared import — avoids dep cycle)
 * - Heuristic extraction only in P2 (LLM extraction is P2+)
 */

import fs from 'fs';
import path from 'path';
import { registerTurnCompleteHandler } from '@craft-agent/session-tools-core';
import { getKnowledgeBaseEngine } from './engine.ts';

// ============================================================
// Config
// ============================================================

const MIN_CONTENT_LENGTH = 150;  // skip very short turns
const MAX_EXTRACT_CHARS = 3000;  // cap per-turn extraction

// ============================================================
// Session JSONL reading (inline — no shared dep)
// ============================================================

interface RawMessage {
  type: string;
  content?: string;
  role?: string;
}

function readLastAssistantMessages(workspaceRootPath: string, sessionId: string, limit = 3): string[] {
  const jsonlPath = path.join(workspaceRootPath, 'sessions', sessionId, 'session.jsonl');
  if (!fs.existsSync(jsonlPath)) return [];

  let raw: string;
  try {
    raw = fs.readFileSync(jsonlPath, 'utf-8');
  } catch {
    return [];
  }

  const messages: string[] = [];
  for (const line of raw.split('\n').filter(Boolean)) {
    try {
      const obj = JSON.parse(line) as RawMessage;
      if (obj.type === 'assistant' && typeof obj.content === 'string' && obj.content.trim()) {
        messages.push(obj.content);
      }
    } catch { /* skip malformed lines */ }
  }

  return messages.slice(-limit);
}

// ============================================================
// Heuristic insight extraction
// ============================================================

function extractInsights(text: string): string | null {
  if (text.length < MIN_CONTENT_LENGTH) return null;

  const lines = text.split('\n');
  const kept: string[] = [];

  for (const line of lines) {
    const t = line.trimStart();
    // Keep headings
    if (/^#{1,3}\s/.test(t)) { kept.push(line); continue; }
    // Keep top-level bullet points (not deeply nested)
    if (/^[-*+]\s/.test(t) && line.indexOf('  ') !== 0) { kept.push(line); continue; }
    // Keep numbered list items
    if (/^\d+\.\s/.test(t)) { kept.push(line); continue; }
    // Keep bold-starting lines (key terms / conclusions)
    if (/^\*\*/.test(t) && t.length < 200) { kept.push(line); continue; }
    // Keep lines after "结论", "总结", "summary", "conclusion", "key points" etc.
    const lower = t.toLowerCase();
    if (/^(结论|总结|summary|conclusion|key (point|insight|takeaway)|要点|核心)/.test(lower)) {
      kept.push(line); continue;
    }
  }

  if (kept.length === 0) {
    // Fallback: first 500 chars of the message
    const snippet = text.slice(0, 500).trim();
    return snippet.length > 80 ? snippet : null;
  }

  return kept.join('\n').slice(0, MAX_EXTRACT_CHARS).trim() || null;
}

// ============================================================
// Journey file writing
// ============================================================

function getTodayString(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function getTimeString(): string {
  const d = new Date();
  return d.toTimeString().slice(0, 5);  // HH:MM
}

function appendToJourney(vaultPath: string, sessionId: string, content: string): void {
  const today = getTodayString();
  const journeyDir = path.join(vaultPath, 'Journey');
  const journeyFile = path.join(journeyDir, `${today}.md`);

  fs.mkdirSync(journeyDir, { recursive: true });

  const entry = `\n## ${getTimeString()} [Session ${sessionId.slice(0, 8)}]\n\n${content}\n`;

  if (!fs.existsSync(journeyFile)) {
    fs.writeFileSync(journeyFile, `# Journey — ${today}\n${entry}`);
  } else {
    fs.appendFileSync(journeyFile, entry);
  }
}

// ============================================================
// Registration
// ============================================================

export function registerWriteBackHandler(): void {
  registerTurnCompleteHandler(async ({ sessionId, workspaceRootPath }) => {
    const engine = getKnowledgeBaseEngine();
    if (!engine || engine.getStatus() !== 'ready') return;
    const cfg = engine.getConfig();
    if (cfg.writeBackMode === 'disabled') return;

    const messages = readLastAssistantMessages(workspaceRootPath, sessionId);
    if (messages.length === 0) return;

    const insights = messages
      .map(extractInsights)
      .filter((s): s is string => s !== null);

    if (insights.length === 0) return;

    const combined = insights.join('\n\n---\n\n');
    appendToJourney(cfg.vaultPath, sessionId, combined);
  });
}
