/**
 * Agent learning context bindings — injects memory/compression callbacks into SessionToolContext.
 */

import type { SessionToolContext } from '@craft-agent/session-tools-core';
import { applyMemoryOperation } from '../memory/storage.ts';
import {
  shouldCompress,
  buildStructuredSummary,
  type CompressionMessage,
} from './context-compression.ts';
import { getSessionScopedToolCallbacks } from './session-scoped-tool-callback-registry.ts';
import { resolveSkillForView } from './skill-view.ts';
import { applySkillDraftManage } from './skill-manage.ts';

export function attachAgentLearningBindings(
  context: SessionToolContext,
  sessionId: string,
  workspaceRootPath: string,
): void {
  Object.defineProperty(context, 'applyMemoryOperation', {
    value: async (args: {
      action: 'add' | 'replace' | 'remove';
      target: 'user' | 'memory' | 'project';
      content: string;
      key?: string;
    }) => {
      const result = applyMemoryOperation(
        workspaceRootPath,
        args.action,
        args.target,
        args.content,
        args.key,
      );
      return { ok: result.ok, message: result.message };
    },
    configurable: true,
    enumerable: true,
  });

  Object.defineProperty(context, 'sessionSearch', {
    get() {
      return getSessionScopedToolCallbacks(sessionId)?.sessionSearchFn;
    },
    configurable: true,
    enumerable: true,
  });

  Object.defineProperty(context, 'onSkillDraftProposed', {
    get() {
      return getSessionScopedToolCallbacks(sessionId)?.onSkillDraftProposedFn;
    },
    configurable: true,
    enumerable: true,
  });

  Object.defineProperty(context, 'getConversationMessages', {
    get() {
      return getSessionScopedToolCallbacks(sessionId)?.getConversationMessagesFn;
    },
    configurable: true,
    enumerable: true,
  });

  Object.defineProperty(context, 'analyzeContextCompression', {
    value: async (opts: { tokenThreshold?: number; dryRun?: boolean }) => {
      const getMessages = getSessionScopedToolCallbacks(sessionId)?.getConversationMessagesFn;
      if (!getMessages) {
        throw new Error('Conversation messages not available.');
      }
      const raw = await getMessages();
      const messages: CompressionMessage[] = raw.map(m => ({
        role: m.role,
        content: m.content,
        toolName: m.toolName,
        isIntermediate: m.isIntermediate,
      }));
      const plan = shouldCompress(messages, opts.tokenThreshold);
      const payload: Record<string, unknown> = {
        ...plan,
        dryRun: opts.dryRun ?? true,
      };
      if (plan.shouldCompress && messages.length > plan.protectedHead + plan.protectedTail) {
        const middle = messages.slice(plan.protectedHead, -plan.protectedTail);
        payload.previewSummary = buildStructuredSummary(middle);
      }
      return JSON.stringify(payload, null, 2);
    },
    configurable: true,
    enumerable: true,
  });

  Object.defineProperty(context, 'viewSkill', {
    value: async (skillSlug: string) =>
      resolveSkillForView(workspaceRootPath, skillSlug, context.workingDirectory),
    configurable: true,
    enumerable: true,
  });

  Object.defineProperty(context, 'manageSkillDraft', {
    value: async (args: {
      skillSlug: string;
      action: 'append' | 'replace_section';
      content: string;
      section?: string;
    }) =>
      applySkillDraftManage({
        workspaceRootPath,
        skillSlug: args.skillSlug,
        action: args.action,
        content: args.content,
        section: args.section,
      }),
    configurable: true,
    enumerable: true,
  });
}
