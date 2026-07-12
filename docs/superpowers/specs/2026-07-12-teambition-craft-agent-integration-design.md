# Teambition - Craft Agents 集成设计

日期：2026-07-12

状态：已确认设计，待实现计划

## 1. 目标

在不污染 upstream 主干能力的前提下，把 Teambition 研发任务接入 Craft Agents：

1. 用户显式领取自己的 Bug、Feature 或 Task。
2. 将任务描述、Log/进展和附件保存为本地任务快照。
3. 为 Teambition 任务创建或复用一个 Craft Agent session。
4. 用户显式触发后，将 Agent 分析进展、任务状态和后续工时同步回 Teambition。
5. 第一阶段使用企业已验证的 User MCP，后续可替换为企业 Open API。

第一阶段不包含后台轮询、Webhook、自动完成任务、自动提交未经确认的工时和多 Agent 抢占。

## 2. 官方能力结论

Teambition 开放平台同时提供 User MCP 和企业应用 Open API。User MCP 适合以当前用户身份快速接入个人任务；Open API 需要企业应用、AppId/AppSecret、appAccessToken、orgId 和对应权限，适合后续企业级控制面。

已确认的 API 能力包括：

- 按项目查询任务，返回任务标题、备注、项目、执行人、状态、自定义字段等；
- 按任务 ID 查询任务详情；
- 创建任务进展，包含内容、状态和附件信息；
- 更新任务类型和工作流状态，使用项目实际的 `sfcId`、`tfsId` 和相关状态 ID；
- 创建计划工时、查询实际工时、更新实际工时。

参考：

- https://open.teambition.com/docs/documents/user-mcp-guide
- https://open.teambition.com/docs/apis/6321c6d1912d20d3b5a49ec1
- https://open.teambition.com/docs/apis/6321c6d2912d20d3b5a4a7b8
- https://open.teambition.com/docs/apis/63ee3ea3912d20d3b543f315
- https://open.teambition.com/docs/apis/64b0bc0f912d20d3b5178ce9
- https://open.teambition.com/docs/apis/6321c6cf912d20d3b5a48f2c
- https://open.teambition.com/docs/apis/640594b7b07df7002be69f92

User MCP 的具体工具集合需要在企业 Token 上进行能力探测，不能假设每个企业 Token 都开放任务、状态、评论和工时工具。

## 3. 总体架构

Craft Agents 只依赖统一的 `TeambitionGateway`，不直接依赖 MCP 工具名、API URL 或 Teambition 字段细节。

```text
UI 命令/面板
    |
Teambition RPC handler
    |
Teambition integration package
    |
TeambitionGateway
    |-----------------------|
UserMcpGateway       OpenApiGateway
    |                       |
User MCP              Enterprise Open API
```

Agent 分析层可以启用 Teambition MCP 作为上下文工具，但任务领取、去重、绑定、状态、进展和工时同步由集成协调器负责。Agent 不自动决定是否回写企业任务。

## 4. 集成边界

建议新增独立模块：

```text
packages/teambition-integration/
├── domain.ts
├── gateway.ts
├── mcp-gateway.ts
├── api-gateway.ts
├── task-bundle.ts
├── bindings.ts
└── sync-policy.ts
```

宿主侧只增加薄接入：

- 独立的 Teambition RPC handler；
- 独立的 UI 命令或面板；
- 工作区级 feature flag；
- 复用现有 SessionManager 的公开创建 session 能力。

不修改通用 Session 协议，不把 Teambition 字段加入所有 Session 类型，不让 UI 直接调用 MCP 工具，也不让 SessionManager 解析 Teambition 数据。

## 5. Gateway 接口

```ts
interface TeambitionGateway {
  getCurrentUser(): Promise<TeambitionUser>
  listMyTasks(input: ListMyTasksInput): Promise<ExternalTaskSummary[]>
  getTaskBundle(taskId: string): Promise<ExternalTaskBundle>

  addProgress(taskId: string, input: ProgressInput): Promise<SyncResult>
  updateWorkflowStatus(taskId: string, input: WorkflowStatusInput): Promise<SyncResult>
  addComment(taskId: string, content: string): Promise<SyncResult>
  recordWorktime?(taskId: string, input: WorktimeInput): Promise<SyncResult>
}
```

`ExternalTaskBundle` 统一包含任务详情、Log/进展、附件、项目和工作流信息。每次写操作返回远端 request ID、远端更新时间和原始操作类型，用于审计和重试。

`recordWorktime` 是可选能力：User MCP 是否支持实际工时新增需要探测；如果只开放计划工时或查询/更新实际工时，界面不应显示不支持的操作。

## 6. 本地绑定与快照

不修改通用 session 存储协议，在工作区增加集成目录：

```text
workspace/
└── integrations/
    └── teambition/
        ├── bindings.json
        └── project-status-cache.json
```

绑定记录：

```ts
type TeambitionBinding = {
  provider: 'teambition'
  taskId: string
  projectId?: string
  uniqueId?: string
  sessionId: string
  sourceSlug: string
  state: 'claimed' | 'active' | 'paused' | 'completed' | 'failed'
  claimedAt: string
  lastPulledAt?: string
  lastPushedAt?: string
  lastSnapshotHash?: string
}
```

每个 Craft session 保存一份任务快照：

```text
sessions/<sessionId>/
├── session.jsonl
├── attachments/
└── data/teambition/
    ├── task.json
    ├── task.md
    └── sync-log.jsonl
```

绑定唯一键为 `workspaceId + taskId`。同一任务再次领取时打开原 session，不创建第二个 session。任务标题不能作为唯一绑定键。

## 7. 领取流程

```text
用户点击「从 TW 领取我的任务」
        |
TeambitionGateway.listMyTasks()
        |
选择一个任务
        |
检查 workspaceId + taskId 绑定
        |-----------------------------|
      已存在                       不存在
        |                            |
打开原 session          拉取详情、进展、附件
                                     |
                           写入 task.json/task.md
                                     |
                           创建 Craft session
                                     |
                           写入 binding
                                     |
                           发送分析 Prompt
```

初始 Prompt 明确要求 Agent 读取 `data/teambition/task.md`，先分析描述、Log、进展和附件，再输出定位假设、待检查代码、风险和下一步计划。Agent 不需要自己从任务标题猜测外部来源。

## 8. 同步策略

默认采用显式同步：

- 领取任务：只创建本地绑定，不自动移动 TW 状态；
- 开始分析：用户点击“同步开始”后，写一条任务进展；
- 同步进展：把当前 Agent 会话摘要写成 TW 进展；
- 回写状态：展示目标工作流状态，用户确认后更新；
- 登记工时：用户明确输入或确认后回写；
- 完成任务：用户点击“完成并回写”后才更新完成状态。

状态不硬编码为“开发中”“已完成”等名称，而是使用任务实际返回的 `sfcId`、`tfsId`、`stageId` 和项目状态列表。

如果远端任务更新时间晚于本地快照的更新时间，回写前必须刷新并提示冲突，禁止静默覆盖他人的更新。

## 9. 凭据安全

企业 SOP 的 User MCP Token 位于 URL 查询参数中。完整 URL 不能写入普通 workspace 配置、session、Prompt 或日志。

推荐存储方式：

```text
workspace source config:
  endpoint: https://企业网关/api/mcp
  credentialRef: teambition-user-token

secure credential store:
  teambition-user-token: <secret>

runtime:
  endpoint + userToken -> MCP client
```

规则：

- 只从现有 credential manager 或系统安全存储读取 Token；
- 日志只显示 source slug，不显示 Token 或完整带 query 的 URL；
- 导出或复制 session bundle 时排除凭据；
- Token 失效时要求重新认证，不删除本地快照；
- User Token、AppSecret 和 appAccessToken 分开存储；
- MCP 能力探测失败时返回可诊断的缺失能力，不让 Agent 猜工具。

## 10. 分阶段交付

### 阶段 0：连接与能力探测

只验证连接和能力，不创建 session、不回写任务。

验收：当前用户身份成功；个人任务列表成功；至少一个任务能读取详情；能力缺失时显示明确提示；凭据不出现在日志。

### 阶段 1：领取任务与本地 session

实现个人任务列表、选择任务、任务快照、附件、session 创建和绑定幂等。

验收：一个 TW task 只创建一个 Craft session；描述、Log 和附件可在 session 中读取；Agent 能基于快照开始分析。

### 阶段 2：显式进展和状态同步

增加“同步 TW 进展”“回写 TW 状态”“刷新 TW 任务”三个入口。

验收：进展能出现在 TW；状态更新使用真实工作流 ID；失败显示待同步；重复点击不产生重复进展；冲突不会静默覆盖。

### 阶段 3：工时与 Open API

先根据 capability matrix 开启计划工时、实际工时查询或实际工时更新。企业需要多用户统一权限和审计时，增加 `OpenApiGateway`，不改变本地绑定和 session 模型。

### 阶段 4：Webhook 和后台自动同步

在前述模型稳定后再增加事件签名校验、幂等、重放、绑定查找和本地刷新。第一版不实现。

## 11. 错误处理

- 连接失败：保留本地任务和 session，显示可重试状态；
- Token 失效：要求重新认证，不删除本地数据；
- 工具缺失：标记 capability unavailable，不执行猜测调用；
- 远端冲突：先刷新任务，再由用户确认是否覆盖；
- 回写超时：写入 `sync-log.jsonl`，允许显式重试；
- 重复同步：使用本地操作指纹和远端更新时间避免重复提交；
- 远端权限不足：显示具体权限/应用缺口，不降级为静默失败。

## 12. 测试策略

- `FakeTeambitionGateway`：领取、重复领取、状态同步、失败重试；
- MCP contract test：能力探测和操作映射；
- API contract test：使用脱敏 fixture，不依赖在线环境；
- binding idempotency test：同一个 task 不创建第二个 session；
- snapshot test：详情、Log、附件完整落盘；
- conflict test：远端更新时间变化时禁止覆盖；
- credential redaction test：Token 不出现在日志、session 和 bundle；
- upstream safety check：main 不包含集成提交，定制分支可独立 typecheck/test。

## 13. 分支与上游同步

当前 fork 保持三段边界：

```text
main
  只跟随 upstream/main

260503-craft
  保留原有定制历史

260705-agent
  当前定制开发与 Teambition 集成
```

Teambition 工作应在 `260705-agent` 下拆成独立 feature 分支和小提交。同步 upstream 时先更新 upstream mirror，再将必要变更合入定制分支。不得直接把集成逻辑写入 main，也不得为了接入 Teambition 重构通用 Source 或 Session 核心。

## 14. 第一版明确不做

- 后台定时轮询；
- Webhook 自动同步；
- 自动完成 Teambition 任务；
- 自动创建新的 Teambition 任务；
- 未经用户确认的工时提交；
- 多人/多 Agent 抢占；
- 企业级中间服务；
- 将 Teambition 特殊字段加入通用 Session 协议。

## 15. 设计结论

第一版采用“显式领取 + 本地快照 + session 一对一绑定 + 显式回写”。底层先使用企业 User MCP，业务层通过 `TeambitionGateway` 隔离 MCP/API 差异。后续企业规模和审计要求增加时，只替换或增加 Gateway 实现，不改变 Agent 会话、绑定记录和本地任务模型。
