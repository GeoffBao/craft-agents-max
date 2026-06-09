## Learned User Preferences
- When interpreting code, respond in Chinese, stay terse, and provide concrete code-level explanations rather than high-level guidance.
- Treat mid-session model/provider switching after quota exhaustion as a top product pain point; prioritize practical fallback paths over broad feature ideation.
- Do not reintroduce the previously added Knowledge top-level module unless explicitly requested; the user judged it unnecessary and incomplete.
- Defer Messaging Gateway always-on UX enhancements unless explicitly requested.
- When adding fork-specific features, keep changes upstream-merge-friendly so Craft Agents upstream can be merged without compounding divergence.

## Learned Workspace Facts
- Craft Agents Max is a Bun workspace monorepo with Electron desktop, CLI, WebUI, viewer apps, and shared packages under `packages/*`.
- The agent runtime supports a Claude Agent SDK backend and a Pi SDK subprocess backend selected through LLM connection config.
- App config and workspace data default to `~/.craft-agent`, with per-workspace sessions, sources, skills, automations, and status config.
- Workspace Skills load from global `~/.agents/skills`, workspace `skills/*/SKILL.md`, and project `.agents/skills`.
- MCP support is modeled as workspace Sources and routed through the shared MCP pool for backend tool calls.
- Sessions lock `llmConnection` after the first message; current model changes stay within the locked connection unless connection-switch logic is added.
- Automations already exist through `AutomationSystem`, scheduler ticks, webhooks, and runtime hooks; messaging gateway supports Telegram, WhatsApp, and Lark.
- Agent learning (Hermes/OpenClaw-inspired) is feature-flagged off by default; enable via `CRAFT_FEATURE_AGENT_LEARNING=1` or workspace `config.json` `agentLearning` (Settings UI controls mirror this).
- Persistent memory stores `USER.md` and `MEMORY.md` under `~/.craft-agent/memory/` and per-workspace `PROJECT.md` under `{workspace}/.craft/memory/`; session recall uses SQLite FTS5 in `{workspace}/.craft/memory-index/`.
