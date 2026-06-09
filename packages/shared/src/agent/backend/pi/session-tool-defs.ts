/**
 * Pi Session Tool Proxy Definitions
 *
 * Thin wrapper around the canonical tool definitions in @craft-agent/session-tools-core.
 * Adds the `mcp__session__` prefix that the Pi SDK expects.
 */

import {
  getToolDefsAsJsonSchema,
  SESSION_TOOL_NAMES,
  type JsonSchemaToolDef,
  type SessionToolFilterOptions,
} from '@craft-agent/session-tools-core';
import { FEATURE_FLAGS } from '../../../feature-flags.ts';

export type SessionToolProxyDef = JsonSchemaToolDef;

export { SESSION_TOOL_NAMES };

export function getSessionToolProxyDefs(
  options?: SessionToolFilterOptions & { includeDeveloperFeedback?: boolean },
): SessionToolProxyDef[] {
  return getToolDefsAsJsonSchema({
    prefix: 'mcp__session__',
    includeDeveloperFeedback: options?.includeDeveloperFeedback ?? FEATURE_FLAGS.developerFeedback,
    includeAgentLearning: options?.includeAgentLearning,
    enabledAgentLearningTools: options?.enabledAgentLearningTools,
  });
}
