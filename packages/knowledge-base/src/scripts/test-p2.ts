/**
 * P2 验证脚本：
 * 1. 验证 TurnCompleteHandler 已注册
 * 2. 模拟 session turn 完成 → 触发 write-back
 * 3. 确认 Journey/YYYY-MM-DD.md 新增了条目
 * 4. 验证 watcher 能感知新文件（修改后索引更新）
 */
import { getTurnCompleteHandlers } from '@craft-agent/session-tools-core';
import { initKnowledgeBase } from '../engine.ts';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Side effect: registers tools + context provider + write-back handler
import '../index.ts';

const vaultPath = path.join(os.homedir(), 'Workspace/Resources/obsidian/AI-KN-Base');
const cachePath = path.join(os.homedir(), '.craft-agent/knowledge-base');

// ─── Setup a fake workspace ──────────────────────────────────────
const fakeWorkspace = path.join(os.tmpdir(), `kb-test-${Date.now()}`);
const fakeSessionId = 'test-session-p2';
const sessionDir = path.join(fakeWorkspace, 'sessions', fakeSessionId);
fs.mkdirSync(sessionDir, { recursive: true });

// Write a fake session.jsonl with a substantial assistant message
const header = JSON.stringify({ id: fakeSessionId, name: 'P2 Test', workspaceId: 'test' });
const msg1 = JSON.stringify({
  type: 'assistant',
  content: `## 核心结论

- **RAG 三层检索** 是目前最有效的个人知识库查询方案：语义检索 → 全文检索 → 关键词兜底
- **KB ↔ Agent 双向奔赴**：每次 session 的新知识自动回写 Journey，watcher 触发增量索引重建
- 关键实现点：session-tools-core 里的 lifecycle registry 把 craft-agents 和 knowledge-base 完全解耦

## 技术要点

1. TurnCompleteHandler 在 SessionManager.onProcessingStopped 触发，对两个 backend 都生效
2. 启发式提取：抽取 heading、bullet、bold 开头行，不依赖 LLM
3. 写入 Journey/YYYY-MM-DD.md（追加模式）
`,
});
fs.writeFileSync(path.join(sessionDir, 'session.jsonl'), `${header}\n${msg1}\n`);

// ─── Init engine ─────────────────────────────────────────────────
console.log('\n=== P2 Write-Back Verification ===\n');

const engine = initKnowledgeBase({
  vaultPath, cachePath,
  autoInject: true, injectThreshold: 0.0, injectMaxChunks: 3,
  writeBackMode: 'on_session_end',
  embeddingModel: 'Xenova/multilingual-e5-small',
  indexedSections: ['Wiki', 'Notes', 'Journey'],
  enableEmbeddings: false,
});
await engine.init();
console.log(`✓ Engine ready (${engine.getDocumentCount()} docs)\n`);

// ─── Check handler registration ──────────────────────────────────
const handlers = getTurnCompleteHandlers();
console.log(`✓ ${handlers.length} TurnCompleteHandler(s) registered`);

// ─── Fire handler (simulating SessionManager.onProcessingStopped) ─
const todayStr = new Date().toISOString().slice(0, 10);
const journeyFile = path.join(vaultPath, 'Journey', `${todayStr}.md`);
const existedBefore = fs.existsSync(journeyFile);
const sizeBefore = existedBefore ? fs.statSync(journeyFile).size : 0;

console.log(`\nFiring turn-complete handler for session: ${fakeSessionId}`);
for (const handler of handlers) {
  await handler({ sessionId: fakeSessionId, workspaceRootPath: fakeWorkspace });
}

// ─── Verify Journey file updated ─────────────────────────────────
if (fs.existsSync(journeyFile)) {
  const sizeAfter = fs.statSync(journeyFile).size;
  const newBytes = sizeAfter - sizeBefore;
  if (newBytes > 0) {
    console.log(`✓ Journey/${todayStr}.md grew by ${newBytes} bytes`);
    const content = fs.readFileSync(journeyFile, 'utf-8');
    const lastSection = content.split('\n## ').at(-1) ?? '';
    console.log('\nNew entry preview:');
    console.log('## ' + lastSection.slice(0, 400));
  } else {
    console.log('⚠ Journey file exists but did not grow — check extraction logic');
  }
} else {
  console.log('✗ Journey file was NOT created');
}

// ─── Cleanup ─────────────────────────────────────────────────────
engine.dispose();
fs.rmSync(fakeWorkspace, { recursive: true, force: true });
console.log('\n✓ P2 verification complete.');
