# ExperienceEngine

[English README](./README.md)

ExperienceEngine 是一个面向编程 Agent 的本地经验介入层。

它会从真实编码任务中学习简短、任务相关的经验，在后续相似任务中决定是否注入这些经验，并记录这次介入到底是帮到了还是干扰了结果。

当前支持的宿主：
- `OpenClaw`
- `Claude Code`
- `Codex`

OpenClaw 兼容要求：
- 需要本机已经有可正常工作的 OpenClaw，并且支持原生插件安装
- 下面的 OpenClaw 安装路径默认要求 `openclaw plugins install` 和 `openclaw gateway restart` 可用
- 发布包要求 Node.js `>=20`

## 它解决的问题

Coding agent 会重复踩同类坑，通常不是因为模型不够聪明，而是因为它缺少**可治理的经验积累机制**。

常见问题是：
- 上一轮任务的教训，在新会话里直接丢失
- memory 会一直加，但通常不会主动退役低价值内容
- 记住的东西越来越多，context 越来越重，agent 的注意力反而被稀释

ExperienceEngine 处理的正是这一层问题。它不试图记住一切，而是专门治理：
- 什么时候该让历史经验介入
- 该注入哪条 `strategy` 或 `warning`
- 这次介入到底有没有帮到任务
- 这条经验是否应该继续保留、降温或退役

**Memory 做加法，EE 做治理。**

## 它和 Memory 的区别

| 问题 | Memory 系统 | ExperienceEngine |
|---|---|---|
| 跨会话保留事实和偏好 | ✅ | 不是核心目标 |
| 记录失败 → 修复 → 成功的经验路径 | 部分解决，通常依赖手工记录 | ✅ 来自真实任务信号 |
| 知道某次注入到底有没有帮助 | ❌ 通常没有 | ✅ 有 helped / harmed 追踪 |
| 自动退役过时或有害经验 | ❌ 通常没有 | ✅ 有 cooling / retired 生命周期 |
| 把注入控制在短小、任务相关的 guidance | 不是核心目标 | ✅ 是核心设计 |

## 它在 Agent Loop 里的位置

```text
用户任务
  -> before_prompt_build：检索并注入匹配经验
  -> agent 推理 + 工具调用：捕获失败、重试、纠正和结果
  -> task finalize：把候选信号提炼成可复用经验
  -> helped / harmed：提升、降温或退役节点
```

ExperienceEngine 工作在 context 层，不会去修改宿主模型权重。

## 经验生命周期

```text
任务信号
  -> candidate
  -> active
  -> cooling
  -> retired
```

每条经验都依赖真实任务结果来演化，而不是简单按时间清理。帮到任务的经验会被强化，反复有害的经验会被降温或退役。

## 当前已经能用什么

当前仓库已经实现并可用：
- `OpenClaw`、`Claude Code`、`Codex` 三个宿主接入
- MCP 原生交互面，以及 CLI / 运维 fallback
- API-first 语义检索与平滑回退：
  - OpenAI `text-embedding-3-small`
  - Gemini `gemini-embedding-001`
  - Jina `jina-embeddings-v3`
  - 受管本地 embedding fallback
  - legacy hash-based fallback
- 通过宿主 agent 直接查看和反馈经验，并保留 CLI fallback：
  - `ee inspect --last`
  - `ee helped`
  - `ee harmed`

如果你想看更细的 ExperienceNode 结构和治理字段，见：

- [Experience Model Overview](./docs/development/experience-model.md)

## 快速开始

ExperienceEngine 现在采用**宿主侧安装优先**。

也就是说，第一步安装命令属于你要使用的宿主，而不是 `ee` CLI。

- `OpenClaw`
  - 宿主原生插件安装：
    - `openclaw plugins install @alan512/experienceengine`
  - 安装后先重启 OpenClaw gateway，再开始真实任务：
    - `openclaw gateway restart`
- `Codex`
  - EE 托管安装：
    - `ee install codex`
  - 原生 / 手工 fallback：
    - `codex mcp add experienceengine --env EXPERIENCE_ENGINE_HOME=$HOME/.experienceengine -- npx -y @alan512/experienceengine codex-mcp-server`
  - 无论走哪条路径，首次接入后都建议在仓库里开启一个新的 Codex 会话，让 MCP 配置和 `AGENTS.md` 指令块生效
- `Claude Code`
  - 宿主原生 marketplace 安装：
    - 先添加 GitHub marketplace：
    - `/plugin marketplace add https://github.com/Alan-512/ExperienceEngine.git`
  - 再安装插件：
    - `/plugin install experienceengine@experienceengine`
  - 如果你需要显式 hooks + MCP wiring，仍可用：
    - `ee install claude-code`
  - 安装后建议开启一个新的 Claude Code 会话，让插件 hooks 和 bundled MCP 配置生效

宿主安装完成后，普通用户应继续直接和宿主 agent 交互。

例如你可以直接问宿主 agent：

- “ExperienceEngine 刚刚注入了什么？”
- “显示最近一次 ExperienceEngine 介入。”
- “把刚才那次 ExperienceEngine 提示标记为 helpful。”

只有在需要显式运维、排障或高级调试时，再使用：

```bash
ee init
ee doctor <openclaw|claude-code|codex>
ee status
ee maintenance embedding-smoke
```

这里的 `ee init` 属于 ExperienceEngine 的**共享初始化**，不是某个宿主自己的安装步骤。

- 第一次把 EE 接到任意一个宿主后，做一次初始化即可。它会统一引导你配置：
  - distillation provider / model / auth
  - embedding 模式 / provider
  - 共享 provider secret
- 之后再安装新的宿主，会复用同一个 EE 数据目录、配置和共享 secret。

最小共享初始化示例：

```bash
ee init distillation --provider openai --model gpt-4.1-mini --auth-mode api_key
ee init secret OPENAI_API_KEY <your-api-key>
ee init embedding --mode api --api-provider openai --model text-embedding-3-small
ee init show
```

如果你更想用 Gemini 或 Jina 做 embedding，可以沿用同样的 `ee init embedding` 流程，只替换 provider 和 model。

## 前置条件

在安装任一宿主前，请先确认对应宿主 CLI 已经能在当前机器正常工作：

- `openclaw`
- `claude`
- `codex`

ExperienceEngine 不会替你安装这些宿主 CLI。它只负责把自己接入一个已经可用的宿主环境。

## 安装模型

ExperienceEngine 现在把“安装”和“运维”明确分开：

- 安装属于宿主
- 验证、修复、状态查看属于 `ee`

这意味着：

- `Codex` 走共享 ExperienceEngine MCP 服务，首次接入优先使用 `ee install codex`
- `Claude Code` 走 Claude 原生插件资产与 marketplace 分发
- `OpenClaw` 走 plugin/runtime 集成

一旦安装完成，宿主 agent 仍然是主交互面。

`ee` CLI 主要负责：

- 共享 provider/model 初始化
- 健康检查
- 修复建议
- 状态查看
- 学习与介入反馈

## 高级按宿主命令

如果你是运维者、开发者，或者想显式控制某个宿主，仍然可以使用：

```bash
ee install openclaw
ee install claude-code
ee install codex
```

这些命令仍然有效，但它们更适合作为：
- 运维 fallback
- 显式修复
- 产品开发期调试

而不是默认公开安装路径。

## 数据目录

默认情况下，ExperienceEngine 的产品状态保存在：

```text
~/.experienceengine
```

其中包括：
- SQLite 数据库
- 产品设置
- 各 adapter 的 install state
- 受管本地 embedding 模型缓存，默认位于 `~/.experienceengine/models/embeddings`
- 受管备份与导出快照

## Embedding 默认行为

当前默认行为：

- `embeddingProvider = "api"`
- provider 优先级：
  - 设置了 `OPENAI_API_KEY` 时优先 OpenAI
  - 设置了 `GEMINI_API_KEY` 时使用 Gemini
  - 设置了 `JINA_API_KEY` 时使用 Jina
- 如果没有任何 API provider 可用，会自动回退到受管本地 embedding

常用环境变量：

- `EXPERIENCE_ENGINE_EMBEDDING_PROVIDER=local`
  - 强制完全本地 embedding
- `EXPERIENCE_ENGINE_EMBEDDING_API_PROVIDER=openai|gemini|jina`
  - 强制指定某个 API embedding provider

## 用户手册

完整用户文档见：

- [ExperienceEngine 用户手册](./docs/user-guide.md)

用户手册里包含安装、宿主差异、首次验证、维护命令和故障排查说明。

## 许可证

本项目采用 MIT License。
详见 [LICENSE](./LICENSE)。
