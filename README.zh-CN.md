# ExperienceEngine

[English README](./README.md)

ExperienceEngine 是一个面向编程 Agent 的本地经验介入层。

它会从真实编码任务中学习简短、任务相关的经验，在后续相似任务中注入这些经验，并记录这次介入到底是帮到了还是干扰了结果。

当前经验内核的验证基线：
- `OpenClaw` 是 candidate 捕获、异步提炼、注入、反馈、退役的主验证宿主。
- `Claude Code` 和 `Codex` 继续作为受支持的产品宿主，复用 ExperienceEngine 的共享交互面。

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

## 当前产品状态

当前仓库已经不再是初始化脚手架。

已经实现并验证的能力：
- OpenClaw 真实 runtime 集成
- Claude Code 真实 runtime 集成
- Codex 真实 runtime 集成
- OpenClaw-first 的经验内核验证路径
- 基于 MCP 的 `Resources / Prompts / Tools` 主交互面
- `inspect / feedback / 管理 / install / repair / upgrade` 的 CLI fallback
- 以下高影响操作的 MCP `plan + confirm` 流程：
  - install / repair / upgrade
  - backup / export / import / rollback

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

## 数据目录

默认情况下，ExperienceEngine 的产品状态保存在：

```text
~/.experienceengine
```

其中包括：
- SQLite 数据库
- 产品设置
- 各 adapter 的 install state
- 受管备份与导出快照

## 用户手册

完整用户文档见：

- [ExperienceEngine 用户手册](./docs/user-guide.md)

用户手册中包含：
- 不同宿主的前置条件
- 安装时会修改哪些本地文件
- 首次安装后的验收步骤
- `MCP` 与 `ee` CLI fallback 的分工
- backup / export / import / rollback 使用方式
- OpenClaw、Claude Code、Codex 的故障排查说明

## 校验

当前仓库的主要校验命令：

```bash
pnpm check
openspec validate --specs
openspec validate --changes --strict
```
