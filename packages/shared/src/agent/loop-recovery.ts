/**
 * Loop recovery — nudge models that stall after tools, thinking-only turns, or invalid tool JSON.
 */

import type { AgentEvent } from '@craft-agent/core/types';

export const MAX_LOOP_RECOVERY_DEPTH = 1;

export const TOOL_CONTINUATION_USER_MESSAGE =
  'You received tool results but have not continued. Process the tool output now: ' +
  'summarize what you learned, take the next required action with tools if needed, ' +
  'or give a final answer to the user. Do not describe a plan without executing it.';

export const THINKING_CONTINUATION_USER_MESSAGE =
  'You produced reasoning but stopped without a final answer or tool calls. ' +
  'Continue now: execute the required tools, or give the user a complete answer. ' +
  'Do not repeat the plan — act on it.';

export const JSON_REPAIR_USER_MESSAGE =
  'Your last tool call used invalid JSON arguments. Retry with a valid tool call: ' +
  'ensure arguments are proper JSON matching the tool schema, with no trailing commentary or markdown fences.';

export type LoopRecoveryKind = 'tool_continuation' | 'thinking_continuation' | 'json_repair';

const JSON_TOOL_ERROR_PATTERNS = [
  /json.*(parse|invalid|unexpected token)/i,
  /failed to parse.*tool/i,
  /invalid.*tool.*(arg|input|call)/i,
  /malformed.*(arg|json)/i,
  /tool_use.*invalid/i,
  /unexpected token.*json/i,
];

export function isJsonToolArgumentError(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed) return false;
  return JSON_TOOL_ERROR_PATTERNS.some(pattern => pattern.test(trimmed));
}

export interface LoopRecoveryTracker {
  observe(event: AgentEvent): void;
  /** @deprecated Use resolveLoopRecoveryKind() */
  needsToolContinuationNudge(): boolean;
  resolveLoopRecoveryKind(): LoopRecoveryKind | null;
  toolResultCount(): number;
  reset(): void;
}

export function createLoopRecoveryTracker(): LoopRecoveryTracker {
  let toolResultCount = 0;
  let finalAssistantTextEmitted = false;
  let intermediateTextEmitted = false;
  let sawComplete = false;
  let sawJsonToolError = false;

  const observe = (event: AgentEvent) => {
    if (event.type === 'tool_result') toolResultCount++;

    if (event.type === 'text_delta') {
      finalAssistantTextEmitted = true;
    }
    if (event.type === 'text_complete') {
      if (event.isIntermediate) {
        intermediateTextEmitted = true;
      } else {
        finalAssistantTextEmitted = true;
      }
    }

    if (event.type === 'error' && isJsonToolArgumentError(event.message)) {
      sawJsonToolError = true;
    }
    if (event.type === 'typed_error') {
      const msg = event.error?.message ?? '';
      if (isJsonToolArgumentError(msg)) sawJsonToolError = true;
    }

    if (event.type === 'complete') sawComplete = true;
  };

  const resolveKind = (): LoopRecoveryKind | null => {
    if (!sawComplete && !sawJsonToolError) return null;
    if (sawJsonToolError && !finalAssistantTextEmitted) return 'json_repair';
    if (toolResultCount > 0 && !finalAssistantTextEmitted) return 'tool_continuation';
    if (
      intermediateTextEmitted
      && !finalAssistantTextEmitted
      && toolResultCount === 0
      && sawComplete
    ) {
      return 'thinking_continuation';
    }
    return null;
  };

  return {
    observe,
    needsToolContinuationNudge() {
      return resolveKind() === 'tool_continuation';
    },
    resolveLoopRecoveryKind: resolveKind,
    toolResultCount: () => toolResultCount,
    reset() {
      toolResultCount = 0;
      finalAssistantTextEmitted = false;
      intermediateTextEmitted = false;
      sawComplete = false;
      sawJsonToolError = false;
    },
  };
}

export function buildLoopRecoveryUserMessage(kind: LoopRecoveryKind): string {
  switch (kind) {
    case 'json_repair':
      return JSON_REPAIR_USER_MESSAGE;
    case 'thinking_continuation':
      return THINKING_CONTINUATION_USER_MESSAGE;
    case 'tool_continuation':
    default:
      return TOOL_CONTINUATION_USER_MESSAGE;
  }
}

/** @deprecated Use buildLoopRecoveryUserMessage(kind) */
export function buildToolContinuationUserMessage(): string {
  return TOOL_CONTINUATION_USER_MESSAGE;
}
