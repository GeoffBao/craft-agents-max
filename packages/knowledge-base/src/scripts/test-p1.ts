/**
 * P1 验证脚本：
 * 1. 验证工具已注册进 SESSION_TOOL_DEFS
 * 2. 验证 context provider 已注册进 session-tools-core registry
 * 3. 模拟一次 RAG 上下文注入（buildKnowledgeContext）
 */
import { getSessionToolDefs, getContextProviders } from '@craft-agent/session-tools-core';
import { initKnowledgeBase } from '../engine.ts';
import os from 'os';
import path from 'path';

// Side effect: registers tools + context provider
import '../index.ts';

console.log('\n=== P1 Verification ===\n');

// 1. Check tool registration
const allDefs = getSessionToolDefs();
const kbTools = allDefs.filter(d => ['search_wiki', 'read_wiki_article', 'ask_knowledge_base'].includes(d.name));
console.log(`✓ Registered ${allDefs.length} total tools (${kbTools.length} KB tools)`);
for (const t of kbTools) {
  console.log(`  - ${t.name} [${t.executionMode}, safeMode:${t.safeMode}, readOnly:${t.readOnly ?? false}]`);
}

// 2. Check context provider registration
const providers = getContextProviders();
console.log(`\n✓ Registered ${providers.length} context provider(s)`);

// 3. Init engine + test RAG context injection
const vaultPath = path.join(os.homedir(), 'Workspace/Resources/obsidian/AI-KN-Base');
const cachePath = path.join(os.homedir(), '.craft-agent/knowledge-base');

console.log('\nInitializing KB engine (full-text mode)...');
const engine = initKnowledgeBase({
  vaultPath, cachePath,
  autoInject: true, injectThreshold: 0.0, injectMaxChunks: 3,
  writeBackMode: 'disabled', embeddingModel: 'Xenova/multilingual-e5-small',
  indexedSections: ['Wiki', 'Notes', 'Journey'], enableEmbeddings: false,
});
await engine.init();
console.log(`✓ Engine ready with ${engine.getDocumentCount()} documents\n`);

// 4. Test each tool handler directly
const { searchWiki: searchFn } = await import('../rag.ts');

const query = 'LLM agent 知识库';
console.log(`Testing context provider with query: "${query}"`);
const context = await providers[0]?.(query) ?? null;
if (context) {
  console.log('✓ Context provider returned KB block:');
  console.log(context.slice(0, 400) + (context.length > 400 ? '\n...' : ''));
} else {
  console.log('⚠ No context returned (threshold might be too high or no results)');
}

engine.dispose();
console.log('\n✓ P1 verification complete.');
