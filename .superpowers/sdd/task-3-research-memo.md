# Task 3 前置调研备忘录：官方文档 / SOP 核实

日期：2026-07-12

调研范围：对照官方 Teambition 开放平台文档（`https://open.teambition.com/docs/documents/66cd468fff36bd665cccf040`）、
官方 User MCP 配置页面（`https://open.teambition.com/user-mcp`）、企业内部 SOP
（`/Users/admin/Downloads/buddy添加tw-mcp操作sop.docx`），核实：

1. Projects & Kanban Task Board (Beta) 的字段/工作流假设
2. User MCP 域名替换与 token 拼接方式
3. Task 3 "不要硬编码单一企业工具前缀" 的能力探测假设

不修改 `packages/teambition-integration` 下 Task 1/2 已落地代码，只做只读研究和文档补充。

---

## 调研方法与限制（必须诚实记录）

- 官方文档链接 `https://open.teambition.com/docs/documents/66cd468fff36bd665cccf040` 在浏览器中打开后
  **未渲染出"Projects & Kanban Task Board (Beta)"专属页面内容**，实际渲染的是"应用开发学习地图"通用页面
  （标题、正文均为学习地图内容，不含 Kanban Beta 字段/工作流描述）。尝试站内搜索"看板"、点击侧边栏
  MCP 相关条目后，也未找到与该 ID 对应的、标题匹配"Kanban Task Board (Beta)"的独立文档。
  **结论：该文档 ID 当前可能已被官方下线、合并或重定向到别的内容，无法在线核实原设计中引用的具体字段清单。**
- 官方 User MCP 页面 `https://open.teambition.com/user-mcp` 需要登录（跳转到
  `account.teambition.com/login?next_url=...`），未登录状态下无法查看具体 Token 详情页/工具列表页面内容。
  **结论：User MCP 的确切 Token 详情 UI 和工具列表展示方式需要企业账号登录后再验证，本次仅能核实公开可达的
  说明性文档（见下）。**
- 通过侧边栏成功定位到官方最新的 MCP 相关公开文档三篇：
  - 《Teambition MCP 概述》（`documents/68ad4901f7d70fb6fb33f159`）
  - 《远程调用 Teambition MCP Server》（`documents/68ad49589aca1c12cfa2e9a2`）
  - 《使用开放平台文档（MCP）》
  这批文档比设计文档中引用的 `user-mcp-guide` 链接更新，且明确写明了 Token 创建流程、URL 使用方式与安全提示。
- 通过 npm registry 核实了官方 `@tng/teambition-openapi-mcp` 包（企业应用级 OpenAPI MCP，非 User MCP），
  获取了其工具命名模式（`camelCase`、以业务对象为前缀，如 `createTaskV3`、`updateTaskStatusV3`、
  `searchProjectTasksV3` 等），可作为工具命名"来源之一"的旁证，但**这是企业应用 OpenAPI MCP，不等同于
  User MCP 的工具集**，两者由不同凭据体系驱动，工具前缀/命名可能不同。

---

## (1) 确认无误的假设

| 设计文档中的假设 | 核实结论 |
|---|---|
| Teambition 同时提供 User MCP 和企业应用 Open API 两条接入路径 | **确认无误**。官方新文档明确区分"应用访问凭证（AppToken）"和"用户访问凭证（UserToken）"，且 User MCP 配置页面独立于企业应用开发者中心。 |
| User MCP 的 Token 以 URL 形式携带，且完整 URL 不能落盘/入日志 | **确认无误，且官方文档比设计假设更严格**。官方原文："所生成的链接代表以当前登录用户身份调用 Teambition 开放能力，相当于个人访问密钥，请勿泄露给他人""若怀疑链接已泄露，可立即删除该 Token，原链接将即时失效"。这与设计文档第 9 节"凭据安全"的处理方式（不写入配置/session/日志、Token 失效要求重新认证但不删除本地快照）方向一致，只是官方额外强调了 Token 具有**有效期**，会自动失效（不仅是"疑似泄露才失效"）。这一点原设计未提及，见下节"需要更新的假设"。 |
| 企业 SOP 使用企业域名替换官方域名（`https://rd.luxshare.com.cn/dev-center/user-mcp`） | **确认无误**。SOP 文档 Step3 明确写"打开网页 https://rd.luxshare.com.cn/dev-center/user-mcp 点击创建token"，Step4 "复制url，并替换"，与原设计假设的"企业网关替换官方域名"完全一致。 |
| User MCP 提供的工具数量级为"80+" | **确认无误**。SOP 原文："TW 有80+的工具，使用好的话，能力很强"。与设计文档第 2 节的定性描述（未列出具体数字但暗示较丰富）方向一致。 |
| 能力探测不能假设每个企业 Token 都开放任务、状态、评论和工时工具 | **确认无误，且需要保留**。官方新文档未提供任何工具列表快照（工具列表需登录后在 Token 详情页动态查看），进一步印证"工具集因企业/Token 而异，不能硬编码"的假设是正确且必要的防御性设计。 |
| Task 3 "不要硬编码单一企业工具前缀，工具名大小写不敏感匹配" | **确认无误，且找到反面证据支持该假设的必要性**。官方企业应用级 OpenAPI MCP（`@tng/teambition-openapi-mcp`）工具命名是 `camelCase`（如 `createTaskV3`），但该包同时支持 `--tool-name-case` 参数（可配置 `camelCase`/`snake_case`/`kebab-case` 等不同命名风格），说明**同一套工具在不同客户端配置下可能呈现不同命名风格**；User MCP 侧目前完全没有公开的确定性工具命名文档。这直接证明"不要硬编码单一企业工具前缀 + 工具名大小写/命名风格不敏感匹配"这条设计原则是必须的，且需要进一步扩展为"不要硬编码任何固定的命名风格（camelCase/snake_case/kebab-case）假设"。 |

---

## (2) 需要更新的假设及具体修改建议

### 2.1 User MCP Token 存在"有效期"且会自动失效（非纯"泄露才失效"）

- **原设计位置**：`docs/superpowers/specs/2026-07-12-teambition-craft-agent-integration-design.md` 第 9 节"凭据安全"，
  规则列表第 4 条："Token 失效时要求重新认证，不删除本地快照"。
- **问题**：原文只覆盖了"失效后如何处理"，没有覆盖"Token 本身就带有效期、会主动过期"这个官方明确说明的事实。
  这意味着即便用户从未做错任何事、User MCP 集成也会在某个可预期的时间点后突然失效，不是纯粹的异常场景。
- **建议**：在设计文档第 9 节末尾补充"实现澄清"小节（不修改已批准的正文），说明：
  - Token 具有创建时设置的有效期，到期后自动失效，与是否泄露无关；
  - 集成层（`mcp-gateway.ts`）应该把"Token 过期"和"Token 被撤销/泄露删除"统一归类为同一种可重试的"需要重新认证"错误路径，UI 侧应显示预期到期时间（如企业 Token 详情页可获取），提前提示用户续期，而不是等到调用失败才发现。
  - 已在本备忘录末尾的落地建议中标注为 Task 3 实现细节之一（见"Task 3-7 实施注意事项"）。

### 2.2 "Projects & Kanban Task Board (Beta)" 具体字段/工作流模型目前无法在线核实

- **原设计位置**：`docs/superpowers/specs/2026-07-12-teambition-craft-agent-integration-design.md` 第 8 节
  "状态不硬编码为'开发中''已完成'等名称，而是使用任务实际返回的 `sfcId`、`tfsId`、`stageId` 和项目状态列表"；
  `...ui-amendment.md` 第 3 节"现有 Projects/Kanban 映射"。
- **问题**：本次调研未能访问到设计文档原始引用的官方 Kanban Beta 专属页面内容（该文档 ID 当前渲染为通用
  学习地图页面，可能已被官方下线/合并/重定向），因此**无法逐字段核实** `sfcId`（Scenario Field Config ID，
  自定义字段配置）、`tfsId`（Task Flow Status ID，工作流状态）这两个字段命名在最新版本中是否仍然是官方推荐的
  精确字段名，也无法核实是否新增/重命名了看板相关字段。
  但通过 API 文档链接标题侧面核实到，`https://open.teambition.com/docs/apis/6321c6d1912d20d3b5a49ec1`
  （"查询项目任务"）等设计文档第 2 节引用的 API 链接仍然可达且未 404，说明底层任务查询 API 大体仍在，
  只是具体返回字段名需要在实际调用时（阶段 0 连接测试）用真实响应验证，不能假设本备忘录已完全验证。
- **建议**：在设计文档第 8 节末尾补充"实现澄清"小节，明确写清：
  - `sfcId`/`tfsId`/`stageId` 是**设计阶段依据历史 API 文档链接推断的字段命名**，Task 3～4 实现 MCP/API
    Gateway 时，**必须以实际探测到的工具返回结构为准**，如果实际字段名不同（例如新版本改为 `statusId`
    或增加了独立的看板列 ID 字段），以真实响应结构为唯一事实来源，不要为了匹配设计文档而做字段名硬编码转换；
  - 建议 Task 3 Step 5（任务归一化）在实现时，把"原始远端字段名 → 内部规范化字段"的映射逻辑集中在一处
    （例如一个显式的 `normalizeWorkflowStatus()` 函数），方便后续官方字段改名时只改一处。

### 2.3 User MCP 是"用户级 Streamable HTTP MCP Server"，与企业应用 OpenAPI MCP 是两套不同的服务实现

- **原设计位置**：`docs/superpowers/specs/2026-07-12-teambition-craft-agent-integration-design.md` 第 3 节
  架构图中的 `UserMcpGateway`。
- **问题**：原设计没有明确说明 User MCP Server 使用的传输协议。官方新文档明确写"支持 Streamable HTTP
  传输协议"，且给出了在 VS Code / Cherry Studio 中的具体接入方式（选择 `HTTP` 类型 + 服务器 URL）。
  这与 Task 3 "创建一个 MCP client 连接" 的实现假设一致，但原设计和计划都没有点名"必须使用 Streamable HTTP
  客户端实现，不是 stdio subprocess"，如果 Craft Agents 现有 MCP 客户端封装默认按 stdio 或 SSE 假设去接，
  可能需要额外确认协议支持。
- **建议**：在设计文档第 5 节 Gateway 接口描述或 mcp-gateway 相关小节补充"实现澄清"：User MCP Server 通过
  **Streamable HTTP** 协议提供服务（非 stdio、非纯 SSE），Task 3 Step 4"运行时 URL 构造"实现时，需要确认
  Craft Agents 现有 MCP client 基础设施（`~/.craft-agent/docs/sources.md` 中 MCP 类型 source 的标准接入方式）
  是否已经支持 Streamable HTTP transport；如果现有封装只支持 stdio/SSE，需要在 Task 3 中显式扩展或选用
  支持 Streamable HTTP 的底层 SDK 分支。

---

## (3) Task 3-7 实施注意事项（坑点清单）

1. **Token 不落盘、不入日志**（design 第 9 节已覆盖，Task 2 已实现日志脱敏）——继续保持，Task 3 新增的
   `probeCapabilities()`、`createUserMcpGateway()` 的任何 debug 输出、异常堆栈都不能包含完整 URL 或 query
   string，包括开发调试时的 `console.log`。
2. **工具名大小写/命名风格不敏感匹配**——不要假设 User MCP 工具名一定是某种命名风格（camelCase/snake_case/
   kebab-case）。已找到旁证：企业应用级 OpenAPI MCP 包本身就支持配置 `--tool-name-case`，说明命名风格可变。
   Task 3 Step 3 的"归一化 + 别名映射"逻辑要对工具名做统一小写/去分隔符处理后再匹配，而不是精确字符串比较。
3. **Token 到期是常态事件，不是异常事件**——UI 和错误处理要把"过期"和"权限不足/工具缺失"分开展示文案，
   过期应该引导用户去企业 Token 页面重新创建，而不是简单报错。
4. **Kanban Beta 的具体字段名以实际探测结果为准**——设计文档中 `sfcId`/`tfsId`/`stageId` 是历史推断，
   Task 3 阶段 0（连接与能力探测）必须记录真实返回的原始字段结构快照（脱敏后），供后续 Task 4-6 的字段
   映射逻辑核对，不能假设这几个字段名一定正确。
5. **User MCP 与企业应用 OpenAPI MCP 工具集不是同一套**——不要把 `@tng/teambition-openapi-mcp` 的工具列表
   或命名模式直接当成 User MCP 的工具列表来硬编码判断，两者凭据体系（UserToken vs AppId/AppSecret+orgId）、
   接入协议、可能的工具子集都不同。Task 3 的 capability probing 必须针对**实际连接的那个 MCP Server**
   动态探测，不能用另一套 MCP（企业应用级）的已知工具名作为兜底假设。
6. **User MCP 使用 Streamable HTTP 传输**——Task 3 Step 4 构造运行时连接时需要确认底层 MCP client 支持
   该协议；如现有 Source 基础设施只验证过 stdio/SSE 类型 MCP source，需要额外验证或扩展。
7. **80+ 工具中，写操作（进展、状态、评论、工时）能力因企业 Token 权限而异**——SOP 只确认了"存在很多工具"，
   没有确认默写操作工具是否对所有企业成员开放（可能受角色权限限制）。Task 3 的 capability probing 结果
   应区分"工具是否在 tools/list 中出现"和"调用时是否因权限不足报错"两种不同的缺失原因，二者都要给出
   可诊断的提示文本，而不是合并成一种"capability unavailable"。

---

## 结论：是否需要调整 Task 3-7 实施细节

**结论：不需要推翻或重写现有 7-Task 计划的任务划分和验收标准，但需要在实现 Task 3（以及受影响的 Task 4）时
补充以下四点具体实现细节**，均已在设计/UI 补充文档中以"实现澄清"小节落地（不改动已批准正文）：

1. Token 过期需要作为**常规可预期事件**处理（而非纯异常/泄露场景），UI 应提前提示到期时间。
2. Kanban Beta 相关字段命名（`sfcId`/`tfsId`/`stageId`）在 Task 3 阶段 0 必须以**真实探测响应**为准记录快照，
   不能假设设计文档中的字段名在当前官方版本中依然精确适用；后续字段映射逻辑要集中在单一归一化函数中。
3. Task 3 的能力探测逻辑必须做**命名风格无关的匹配**（不仅是大小写不敏感，还包括分隔符风格），因为已有
   证据表明 Teambition MCP 生态中存在可配置的工具命名风格。
4. 确认 User MCP 使用 **Streamable HTTP** 传输协议，Task 3 Step 4 的运行时连接实现需要针对该协议验证或
   扩展现有 MCP client 基础设施，不能假设复用未验证过的 stdio/SSE 路径。

以上四点均为"实现阶段需要额外注意的细节"，不涉及推翻既有架构（`TeambitionGateway` 接口、本地快照/绑定
模型、显式同步策略、Projects/Kanban 复用方案）。原设计的核心结论——"User MCP 优先接入 + Gateway 隔离
MCP/API 差异 + 能力探测防止硬编码" ——经核实依然成立，且找到了具体证据支持其必要性。
