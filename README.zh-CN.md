# ExperienceEngine

[English README](./README.md)

ExperienceEngine 是一个面向编程 Agent 的本地经验介入层。

它会从真实编码任务中学习简短、任务相关的经验，在后续相似任务中决定是否注入这些经验，并记录这次介入到底是帮到了还是干扰了结果。

当前支持的宿主：
- `OpenClaw`
- `Claude Code`
- `Codex`

## 它到底做什么

ExperienceEngine 不是通用记忆库，也不是 context engine 的替代品。

它主要做 4 件事：
- 从宿主 Agent 捕获任务、工具和结果信号
- 把有价值的经验压缩成短小的 `strategy` 或 `warning` 节点
- 判断当前任务是否值得注入经验
- 根据真实 `helped` / `harmed` 结果更新节点状态

## 它和 Memory 有什么不同

大多数 agent memory 系统解决的是：

- 记住哪些事实
- 记住哪些用户偏好
- 下次会话该带上哪些仓库上下文

ExperienceEngine 解决的是另一层问题：

- 什么时候该让历史经验介入
- 该注入哪条 `strategy` 或 `warning`
- 这次介入到底有没有帮到任务
- 这条经验是否应该继续保留、降温或退役

简单说：
- memory 更像“记住事实和偏好”
- ExperienceEngine 更像“治理可复用的编码经验”

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
- 本机共享目录的 `Experience Pack` 工作流：
  - `draft`
  - `review`
  - `publish`
  - `rollback`
- 面向宿主文件的编译与部署：
  - `AGENTS.md`
  - `CODEX.md`
  - `CLAUDE.md`
  - GitHub agent profile markdown

## 快速开始

ExperienceEngine 现在采用**宿主原生安装**。

也就是说，第一步安装命令属于你要使用的宿主，而不是 `ee` CLI。

- `OpenClaw`
  - 一步安装：
    - `openclaw plugins install @alan512/experienceengine`
- `Codex`
  - 一步接入：
    - `codex mcp add experienceengine --env EXPERIENCE_ENGINE_HOME=$HOME/.experienceengine -- npx -y @alan512/experienceengine codex-mcp-server`
- `Claude Code`
  - 先添加 GitHub marketplace：
    - `/plugin marketplace add https://github.com/Alan-512/ExperienceEngine.git`
  - 再安装插件：
    - `/plugin install experienceengine@experienceengine`
  - 如果你需要显式 hooks + MCP wiring，仍可用：
    - `ee install claude-code`

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

- `Codex` 走 Codex 原生 MCP 接入
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

用户手册里包含安装、宿主差异、首次验证、pack 工作流、compiler/deploy 命令、维护命令和故障排查说明。
