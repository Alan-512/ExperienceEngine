# ExperienceEngine

[English README](./README.md) | 简体中文

ExperienceEngine 是一个面向编程 Agent 的治理层。它复用真实执行经验，但不会把 memory 变成噪声堆积。它只会在相关时注入简短、任务相关的 guidance，并持续记录这次介入到底是帮到了还是干扰了结果。

**Memory 做加法，ExperienceEngine 做治理。**

当前支持的宿主：`OpenClaw`、`Claude Code`、`Codex`

## 10 秒理解

没有 ExperienceEngine：
- agent 会在相似仓库里重复犯同样的 SQLite migration 错误
- 它会先打开数据库、再补 migration，然后在错误方向上浪费几轮

有 ExperienceEngine：
- 它会在真正调用工具之前注入一条很短的约束，例如：`先执行 migration，再打开数据库连接`
- 宿主 agent 会直接避开上次已经踩过的错路，而不是重新试错
- 任务结束后，ExperienceEngine 通常会根据真实结果自动更新这条 guidance
- 如果这条 guidance 后面开始伤害相似任务，ExperienceEngine 会把它降温、隔离或退役

任务流：`任务信号 -> 提炼经验 -> 检索 -> 短提示注入 -> 反馈 -> 治理`

<details>
<summary>宿主里的示例对话</summary>

用户：修一下这个仓库里的 SQLite 启动失败问题。

宿主 agent：ExperienceEngine 在这个仓库里找到了一个之前成功过的修复模式：`先执行 migration，再打开数据库连接。` 我会先补 migration，然后再重试启动。

用户：为什么这条 ExperienceEngine 提示会命中？

宿主 agent：它匹配到了这个仓库里过去一次相同的 SQLite 启动失败，以及当时成功的 migration-first 修复路径。

用户：所以 ExperienceEngine 的作用，是提前把我从同样的错路上拉回来？

宿主 agent：对。它在下一次工具调用前复用了这个仓库里的成功路径，而且这次任务结束后通常会自动判断这条经验到底帮到了还是干扰了结果。

</details>

![`ee inspect --last --verbose` 示例输出](./docs/assets/readme/inspect-last-example.svg)

## 快速开始

最快的宿主安装路径：

如果你需要使用 `ee init`、`ee install ...` 或其他 operator 命令，请先安装 CLI：

```bash
npm install -g @alan512/experienceengine
```

- `OpenClaw`
  - `openclaw plugins install @alan512/experienceengine`
  - `openclaw gateway restart`
  - `ee init`
- `Codex`
  - `ee install codex`
  - `ee init`
- `Claude Code`
  - `/plugin marketplace add https://github.com/Alan-512/ExperienceEngine.git`
  - `/plugin install experienceengine@experienceengine`
  - `ee init`

`ee init` 用于在宿主安装完成后初始化共享的 ExperienceEngine 状态。

如果你需要更详细的宿主安装说明、fallback 路径、ready 状态说明或 operator 工作流，跳转到 [完整安装与运维说明](#完整安装与运维说明)。

## 适合谁用

以下情况适合使用 ExperienceEngine：
- 你会在相似仓库或相似工作流里反复使用 coding agent
- 你想要的是**短小、介入式 guidance**，而不是泛化的 memory recall
- 你关心历史经验到底是**帮到了还是害了**
- 你希望过时 guidance 能自动降温或退役，而不是越积越多

以下情况不适合：
- 你只想要一个个人笔记型 memory
- 你想要通用文档 RAG
- 你的工作流几乎不重复
- 你希望系统默认记住所有东西

## 宿主支持矩阵

| 宿主 | 安装路径 | 日常交互 | 成熟度 |
|---|---|---|---|
| `OpenClaw` | 原生插件安装 | 宿主原生 | 当前最完整 |
| `Claude Code` | marketplace 插件，保留 `ee install claude-code` fallback | MCP + plugin hooks | 已支持 |
| `Codex` | `ee install codex`，保留原生 MCP fallback | hooks + MCP | 已支持 |

## 为什么要做这个

Coding agent 会重复犯同类错误，通常不是因为模型不够聪明，而是因为之前的执行经验没有被**以可治理的方式**复用。

ExperienceEngine 的目标不是通用 memory 累积，而是**介入治理**。

## 为什么不是 Memory / RAG

| 问题 | Memory 系统 | ExperienceEngine |
|---|---|---|
| 跨会话保存事实和偏好 | 可以 | 不是核心目标 |
| 捕获失败 -> 修复 -> 成功的经验路径 | 部分支持，通常依赖人工 | 可以，来自真实任务信号 |
| 知道一条回忆到底有没有帮助 | 通常不行 | 可以，逐次记录 |
| 自动退役过时或有害 guidance | 通常不行 | 可以，内建 cooling / retired 生命周期 |
| 保持提示短小、任务相关 | 不是核心目标 | 是 |
| 通用文档检索 | 常见适用场景 | 不是核心目标 |

## 为什么它不是另一层记忆

ExperienceEngine 不是想比宿主“记住更多东西”。它的核心价值，是持续治理一条已经学到的 guidance 还应不应该继续影响后续任务。

- 大部分学习动作发生在任务之后，所以当前任务不需要等待整条经验处理链路跑完
- 每条经验节点都会经历 `candidate`、`active`、`cooling`、`retired` 这样的生命周期
- “存下来” 和 “还能不能继续上线” 是分开的，所以有害 guidance 可以被降温、隔离，或者退出正常注入路径
- 任务结束后的审查会继续判断这条 hint 到底是帮到了、伤害了，还是仍然不确定
- 即使这次没有注入 hint，delivery decision 也会被记录下来，所以之后仍然能解释为什么跳过
- 同仓库高匹配经验在成功复用后可以从保守投放提升到正常投放；跨仓库复用默认仍保持保守，除非后续证据更强
- 这个产品追求的是“生产安全的经验复用”，不是“尽量多记、尽量多召回”

## 它在 Agent Loop 里的位置

从高层看，ExperienceEngine 围绕 agent loop 的位置是这样的：

- `用户任务`
- `before_prompt_build`：检索并注入匹配经验
- `agent 推理 + 工具调用`：捕获失败、重试、修正和结果
- `task finalize`：把候选信号提炼成可复用经验
- `helped / harmed`：提升、降温或退役节点

ExperienceEngine 工作在 context 层，不会修改宿主模型权重。

## 经验生命周期

`任务信号 -> candidate -> active -> cooling -> retired`

每条经验都根据真实任务结果演化，而不是按时间粗暴清理。帮到任务的经验会被强化，反复有害的经验会被降温或退役。

## 现在能做什么

- 在相似编码任务里复用短 guidance
- 查看某条 hint 为什么命中，或者为什么这次没有注入
- 让 ExperienceEngine 根据真实任务结果自动强化、降温、隔离或退役 guidance
- 当自动判断不准时，手动把最近一次介入标记为 helpful 或 harmful
- 查看 active、cooling、quarantined、retired 等生命周期状态
- 在 `OpenClaw`、`Claude Code`、`Codex` 三个宿主中使用

### 底层实现

- MCP 原生交互面，加上 CLI / operator fallback
- 支持 API 与本地回退的语义检索
- 确定性的 match scorecard，用来区分同仓库高置信匹配和更宽泛的跨仓库复用
- 宿主 agent 内可直接查看和反馈经验，CLI fallback 包括 `ee inspect --last`、`ee helped`、`ee harmed`

如果你想看 ExperienceNode 结构和治理字段，见：

- [Experience Model Overview](./docs/development/experience-model.md)

## 当前状态

- Stable：核心经验生命周期、inspect/helped/harmed loop、宿主集成、CLI/operator fallback
- 推荐优先路径：使用你已经在用的宿主；如果从零开始，`OpenClaw` 目前是最完整的原生插件路径
- 仍在演进：retrieval 调优、provider 策略、更高级的宿主 UX
- 如果你还没有固定宿主，建议先从 `OpenClaw` 开始。

## 什么叫第一次真正成功

安装并初始化后，第一次真正体现价值的信号通常是：

- 一类重复任务不再重走之前已经犯过的错路
- ExperienceEngine 只注入一条很短、和当前仓库直接相关的约束，而不是把上下文塞满
- 宿主能解释为什么这条 hint 会命中，或者为什么这次没有注入
- 任务结果通常会自动影响以后是否继续投放这条经验
- `ee inspect --last` 能看到最近的介入和相关节点状态

## 前置条件

安装宿主前，请先确认对应宿主 CLI 已能在当前机器正常工作：

- `openclaw`
- `claude`
- `codex`

**ExperienceEngine 不会替你安装这些宿主 CLI。** 它只会接入一个已经可用的宿主环境。

OpenClaw 说明：
- 需要本机已有可正常工作的 OpenClaw，且支持原生插件安装
- 下面的 OpenClaw 路径默认要求 `openclaw plugins install` 和 `openclaw gateway restart` 可用
- ExperienceEngine 会从 OpenClaw hook payload 或附近仓库标记解析真实项目根目录；如果 OpenClaw 只上报全局 workspace，ExperienceEngine 会把该会话隔离起来，避免复用不相干的全局 workspace 经验

通用包要求：
- 发布包要求 Node.js `>=20`

## 完整安装与运维说明

### 按宿主安装

ExperienceEngine 现在不再把 `ee` CLI 当成适用于所有宿主的统一首要安装入口。

请先从宿主自己的安装路径接入：

- `OpenClaw`
  - 宿主原生插件安装：
    - `openclaw plugins install @alan512/experienceengine`
  - 安装后，在开始真实任务前先重启 gateway：
    - `openclaw gateway restart`
- `Codex`
  - EE 托管安装：
    - `ee install codex`
  - 原生 / 手工 fallback：
    - 如果你需要直接 MCP wiring，可参考后面的高级示例
  - 无论走哪条路径，首次接入后都建议在仓库里开启一个新的 Codex 会话，让项目 hooks、MCP 配置和 `AGENTS.md` 指令块生效
  - 托管安装后的首次使用，需要在 Codex 里打开 `/hooks`，批准 ExperienceEngine 的 `UserPromptSubmit`、`PostToolUse`、`Stop` hooks
  - 如果同一个仓库同时用于 Windows Codex App 和 WSL Codex CLI，项目 `.codex/hooks.json` 可以共享；MCP 注册仍然属于每个运行时自己的 Codex home
- `Claude Code`
  - 宿主原生 marketplace 安装：
    - 先添加 GitHub marketplace：
    - `/plugin marketplace add https://github.com/Alan-512/ExperienceEngine.git`
  - 再安装插件：
    - `/plugin install experienceengine@experienceengine`
  - 如果你需要显式 hooks + MCP wiring，仍可使用：
    - `ee install claude-code`
  - 安装后建议开启一个新的 Claude Code 会话，让插件 hooks 和 bundled MCP 配置生效

无论哪个宿主，整体流程都是一样的：

1. 通过宿主路径安装 ExperienceEngine
2. 执行一次 `ee init` 初始化共享状态
3. 重启或新开宿主会话，直到仓库变成 `Ready`
4. 日常检查和反馈优先留在宿主内部完成
5. 需要验证、修复或深度排障时，再退回 `ee` CLI

### 共享初始化

`ee init` 属于 ExperienceEngine 的共享初始化，不是某个宿主自己的安装步骤。

- 第一次接入任意宿主后执行一次，用来配置：
  - distillation provider / model / auth
  - embedding 模式 / provider
  - 共享 provider secret
- 后续再接入其他宿主，会复用同一个 ExperienceEngine home、配置和共享 secret

安装完成后，ExperienceEngine 应该把用户引导到下一步状态：

- 如果宿主 wiring 已完成，产品至少是 `Installed`
- 执行完 `ee init` 后，进入 `Initialized`
- 宿主或仓库完成 reload 并能开始真实任务后，进入 `Ready`

最小共享初始化示例：

1. `ee init distillation --provider openai --model gpt-4.1-mini --auth-mode api_key`
2. `ee init secret OPENAI_API_KEY <your-api-key>`
3. `ee init embedding --mode api --api-provider openai --model text-embedding-3-small`
4. `ee init show`

如果你更想用 Gemini 或 Jina 做 embedding，可以沿用同样的 `ee init embedding` 流程，只替换 provider 和 model。

### 日常使用与 Operator 使用

日常使用时，优先直接问宿主 agent 当前的 ExperienceEngine 状态。默认主路径是自动结果归因；手动 feedback 主要用于你觉得自动判断不准时的纠偏。

例如：

- “ExperienceEngine 刚刚注入了什么？”
- “为什么那条 ExperienceEngine 提示会命中？”
- “为什么这次 ExperienceEngine 没有注入？”
- “把刚才那次 ExperienceEngine 介入标记为 helpful 或 harmful。”

正常使用里，你不应该需要手动给每次介入都打分。ExperienceEngine 的默认路径是根据真实任务结果自动学习；只有当自动判断明显不对时，你再手动纠偏。

OpenClaw 还支持这些 readiness / silence 问题：

- “ExperienceEngine 这里 ready 了吗？”
- “这个仓库里的 ExperienceEngine 还在 warming up 吗？”
- “刚才为什么 ExperienceEngine 没有注入？”

对于 `OpenClaw`、`Codex`、`Claude Code`，常规 review / feedback 路径都应优先留在宿主内部完成。
只有宿主侧路径不可用，或者你需要显式 operator 控制时，再退回 CLI。

当你需要显式运维、验证或排障时，可以用：

```bash
ee init
ee doctor <openclaw|claude-code|codex>
ee status
ee maintenance embedding-smoke
```

### Ready 与 Value 状态

ExperienceEngine 把 onboarding 和 value 拆成两层：

- `Setup state`
  - `Installed`
  - `Initialized`
  - `Ready`
- `Value state`
  - `Warming up`
  - `First value reached`

这不是一条严格线性阶梯。一个仓库可以已经 `Ready`，但还处于 `Warming up`。

`First value reached` 只应该在真实任务里已经出现可见价值时才成立。仅仅显示 onboarding 文案或 warm-up 提示，不算 first value。

## 安装模型

ExperienceEngine 明确拆分：
- 宿主安装
- 共享初始化
- operator 工作流

宿主仍然是主交互面。
`ee` 仍然是显式的 operator 面，用于 setup、验证、修复、状态查看和维护。
对于 Codex，`ee status` 和 `ee doctor codex` 还会显示 `ee` CLI fallback 是否在 `PATH` 上可用。Codex 的 MCP 接入在 CLI fallback 缺失时仍可能正常工作，但 `ee inspect --last` 这类命令需要 PATH 里有 `ee`，或者使用显式的包调用方式。
如果同一个仓库同时用于 Windows Codex App 和 WSL Codex CLI，请把 `.codex/hooks.json` 当成仓库级 hook wiring，把 `~/.codex/config.toml` 当成每个运行时自己的 MCP wiring。`ee repair codex` 会刷新项目 hook launcher，并移除过期的项目级 ExperienceEngine MCP 配置，避免 Windows App 和 WSL CLI 争用同一个配置文件。

## 高级按宿主命令（仅限 Operator / 开发者）

大多数用户可以跳过这一节，直接使用上面的宿主安装路径。

如果你是运维者、开发者，或者确实想显式控制某个宿主，仍可使用：

```bash
ee install openclaw
ee install claude-code
ee install codex
```

<details>
<summary>Codex 原生 / 手工 MCP fallback 示例</summary>

```bash
codex mcp add experienceengine --env EXPERIENCE_ENGINE_HOME=$HOME/.experienceengine -- npx -y @alan512/experienceengine codex-mcp-server
```

</details>

说明：
- `OpenClaw` 走 plugin/runtime integration，而不是 `src/adapters/`
- `Claude Code` 会安装 hooks 和共享 ExperienceEngine MCP 服务
- `Codex` 会安装 Codex 原生 hooks 和共享 ExperienceEngine MCP 服务。`ee codex exec` 仍是确定性的非交互 fallback。
- Codex 的 `UserPromptSubmit` 保持同步，因为它负责 prompt-time experience injection。`PostToolUse` 和 `Stop` 默认排队后在后台处理。`PreToolUse` 默认不注册；只有同步 gating 实验需要时才设置 `EXPERIENCE_ENGINE_CODEX_PRETOOL_HOOK_ENABLED=1` 启用。
- Codex App 和 Codex CLI 打开同一个仓库时都会读取仓库级 project hooks。如果 Codex 提示 hooks 需要 review，打开 `/hooks`，批准 ExperienceEngine 的 `UserPromptSubmit`、`PostToolUse`、`Stop`；如果启用了 `EXPERIENCE_ENGINE_CODEX_PRETOOL_HOOK_ENABLED=1`，再批准 `PreToolUse`。
- `ee install ...` 与 `ee doctor ...` 会在 `npm` / `pnpm` 使用非官方 registry 时给出提示，因为受管模型下载在 `https://registry.npmjs.org` 下最稳定
- 成功执行 `ee install ...` 后，也会提醒冷启动预期：capture 会立刻开始，但 formal experience 一般需要在同一仓库里出现几次相似任务后才会形成

这些命令属于 operator fallback，不是默认公开安装路径。

## 数据目录

默认情况下，ExperienceEngine 的产品状态保存在：

```text
~/.experienceengine
```

其中包括：
- SQLite 数据库
- 产品设置
- 各 adapter 的 install state
- 可选本地 embedding 模型缓存，默认位于 `~/.experienceengine/models/embeddings`
- 受管备份与导出快照

## Embedding 默认行为

当前默认行为：

- `embeddingProvider = "api"`
- provider 优先级：OpenAI -> Gemini -> Jina
- 如果没有任何 API provider 可用，会回退到 legacy hash-based retrieval
- 本地语义 embedding 是可选增强，默认安装不再包含本地模型运行时

常用环境变量：

- `EXPERIENCE_ENGINE_EMBEDDING_PROVIDER=local`
  - 安装可选本地运行时后，强制完全本地 embedding：
    `npm install -g @huggingface/transformers`
- `EXPERIENCE_ENGINE_EMBEDDING_API_PROVIDER=openai|gemini|jina`
  - 强制指定某个 API embedding provider

## 用户手册

完整用户文档见：

- [ExperienceEngine 用户手册](./docs/user-guide.md)

用户手册里包含安装、宿主差异、首次验证、维护命令和故障排查说明。

## 许可证

本项目采用 MIT License。
详见 [LICENSE](./LICENSE)。
