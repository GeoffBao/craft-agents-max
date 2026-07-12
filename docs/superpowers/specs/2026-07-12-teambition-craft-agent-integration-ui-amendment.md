# Teambition - Craft Agents UI 映射补充

日期：2026-07-12

关联设计：[Teambition - Craft Agents 集成设计](./2026-07-12-teambition-craft-agent-integration-design.md)

## 1. 任务类型

Teambition 研发任务分为三类：

```ts
type TeambitionTaskKind = 'feature' | 'bug' | 'task'
```

- `feature`：项目对应的功能适配或新增功能；
- `bug`：项目对应的问题修复；
- `task`：领导安排的通用任务，可能涉及代码，也可能只需要 Agent 对话完成。

## 2. 执行范围

通用 Task 不强制绑定项目，执行范围显式建模为：

```ts
type ExecutionScope =
  | { type: 'workspace' }
  | { type: 'project'; projectId: string }
```

规则：

- Feature 必须绑定 Craft Project；
- Bug 必须绑定 Craft Project；
- 通用 Task 可以仅创建 Agent session，也可以绑定 Craft Project；
- 如果通用 Task 后续发现需要改代码，可以在原 session 上补绑 Craft Project，不重新创建 session。

## 3. 现有 Projects/Kanban 映射

不新增独立的 Teambition 看板，复用当前 Craft Agents 的 Projects 和 Kanban：

```text
Feature / Bug
  Teambition project
    -> Craft Project
      -> project working directory
        -> Kanban TaskTile
          -> Craft Agent session

通用 Task
  -> Craft Agent session
    -> workspace-only，显示在 All Tasks / 无项目
    -> project-bound，显示在对应 Craft Project 看板
```

Kanban 列代表 Craft Agent 的本地执行状态；Teambition 工作流状态单独显示和同步。拖动 Kanban 卡片默认只改变本地状态，不能隐式修改 Teambition。

> **实现澄清（2026-07-12 Task 3 前置调研补充，不改变以上已批准规则）**：本次调研未能在线访问到官方“Projects & Kanban Task
> Board (Beta)”专属文档（链接当前渲染为通用学习地图页面），因此上述看板列/工作流映射仍符合原设计意图，
> 但字段名称细节（参见设计文档第 8 节 `sfcId`/`tfsId`/`stageId`）尚未在线逐字复核，实现时必须以
> Task 3 阶段 0 实际探测到的字段为准。详见 `.superpowers/sdd/task-3-research-memo.md`。

## 4. 领取界面

领取时按任务类型展示执行范围：

- Feature/Bug：显示 TW 项目到 Craft Project 的映射；找不到映射时要求选择；
- 通用 Task：提供“仅创建 Agent 对话”和“绑定到 Craft Project”；
- 所有类型都显示 TW 来源、任务 ID、同步状态；
- 领取已有绑定任务时打开原 session，不创建重复 session。

## 5. 卡片操作

TW 任务复用现有 Kanban TaskTile，并增加外部任务元信息和显式操作：

- 查看 TW 任务；
- 刷新任务快照；
- 同步 Agent 进展；
- 回写 TW 状态；
- 登记或同步工时（仅在能力探测确认可用时显示）；
- 为 workspace-only Task 补绑 Craft Project。

这些操作由 Teambition 集成协调器执行。TaskTile 不直接调用 MCP，Kanban 拖动也不直接触发 TW 回写。

## 6. 设计结论

通用 Task 是“可选项目绑定”的 Agent 任务，而不是必须归属某个代码项目的任务。该模型同时覆盖纯对话任务、方案整理任务和后续转为代码修改的任务，并与当前 Kanban 的有项目/无项目任务模型保持一致。
