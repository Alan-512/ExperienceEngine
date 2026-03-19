# ExperienceEngine

[English README](./README.md)

ExperienceEngine 是一个面向编程 Agent 的本地经验介入层。

它会从真实编码任务中学习简短、任务相关的经验，在后续相似任务中注入这些经验，并记录这次介入到底是帮到了还是干扰了结果。

当前已验证的宿主：
- `OpenClaw`：runtime / plugin 集成
- `Claude Code`：hooks + MCP 交互
- `Codex`：MCP-first runtime 与交互

## 它能做什么

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

## 当前能直接使用的能力

当前仓库已经实现并可用：
- `OpenClaw`、`Claude Code`、`Codex` 三个宿主接入
- 基于 MCP 的主交互面，以及 CLI fallback
- 基于本地 embedding 的检索
- 快速查看与反馈：
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

从源码目录启动：

```bash
pnpm install
pnpm build
node dist/cli/index.js doctor codex
```

如果已经作为命令安装，可直接使用：

```bash
ee doctor codex
```

## 前置条件

在安装任一 adapter 前，请先确认对应宿主 CLI 已经能在当前机器正常工作：

- `openclaw`：用于 OpenClaw adapter
- `claude`：用于 Claude Code adapter
- `codex`：用于 Codex adapter

ExperienceEngine 不会替你安装这些宿主 CLI。它只会把自己接入一个已经可用的宿主环境。

## 按宿主安装

```bash
ee install openclaw
ee install claude-code
ee install codex
```

说明：
- `OpenClaw` 走 plugin/runtime 集成，管理面更多依赖 CLI fallback
- `Claude Code` 会同时安装 hooks 和共享 MCP server
- `Codex` 会安装共享 MCP server
- `ee install ...` 和 `ee doctor ...` 现在会检查 `npm/pnpm` 是否使用非官方 registry；受管模型下载默认建议使用 `https://registry.npmjs.org`
- `ee install ...` 成功后还会主动说明冷启动预期：采集会立刻开始，但正式经验通常需要同仓库内几次相似任务后才会出现

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

## 用户手册

完整用户文档见：

- [ExperienceEngine 用户手册](./docs/user-guide.md)

用户手册里包含安装、宿主差异、首次验证、pack 工作流、compiler/deploy 命令、维护命令和故障排查说明。
