/**
 * P0 验证脚本：索引指定 vault 并运行几条搜索，确认基础功能正常。
 * 用法：bun run packages/knowledge-base/src/scripts/test-index.ts [vaultPath]
 */
import { initKnowledgeBase } from '../engine.ts';
import os from 'os';
import path from 'path';

const vaultPath = process.argv[2]
  ?? path.join(os.homedir(), 'Workspace/Resources/obsidian/AI-KN-Base');

const cachePath = path.join(os.homedir(), '.craft-agent/knowledge-base');

console.log(`\n=== Knowledge Base P0 Test ===`);
console.log(`Vault: ${vaultPath}`);
console.log(`Cache: ${cachePath}\n`);

const engine = initKnowledgeBase({
  vaultPath,
  cachePath,
  autoInject: true,
  injectThreshold: 0.0,
  injectMaxChunks: 3,
  writeBackMode: 'disabled',
  embeddingModel: 'Xenova/multilingual-e5-small',
  indexedSections: ['Wiki', 'Notes', 'Journey'],
  enableEmbeddings: false,  // P0: full-text only; enable in P1 after WASM verification
});

const t0 = Date.now();
console.log('Loading vault and building index...');
await engine.init();
const loadMs = Date.now() - t0;

console.log(`✓ Loaded ${engine.getDocumentCount()} documents in ${loadMs}ms\n`);

const queries = [
  'transformer attention mechanism',
  '注意力机制',
  'LLM agent',
  'Obsidian知识库',
];

for (const q of queries) {
  const t1 = Date.now();
  const results = await engine.search(q, 3);
  const searchMs = Date.now() - t1;

  console.log(`Query: "${q}" (${searchMs}ms)`);
  if (results.length === 0) {
    console.log('  No results.\n');
  } else {
    for (const r of results) {
      const scoreLabel = r.matchType === 'semantic'
        ? `semantic ${(r.score * 100).toFixed(0)}%`
        : `fulltext ${r.score.toFixed(1)}`;
      console.log(`  [${scoreLabel}] ${r.relativePath}`);
      console.log(`    ${r.title}`);
      console.log(`    ${r.excerpt.slice(0, 120)}…`);
    }
    console.log();
  }
}

const rag = await engine.getRagContext('如何用 agent 自动整理知识库');
console.log('--- RAG context block ---');
console.log(rag.formattedContext || '(no relevant chunks above threshold)');

engine.dispose();
console.log('\n✓ Done.');
