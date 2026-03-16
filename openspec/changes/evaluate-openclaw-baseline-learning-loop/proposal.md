## Why

ExperienceEngine v3 的内核主线已经收口到 `candidate -> async distill -> node -> inject -> feedback -> retire`，并把 OpenClaw 定义为核心学习链路的验证基准宿主。当前真正缺的不是更多功能，而是一套可执行、可复现、可沉淀结果的 OpenClaw-first 基线评估流程。

如果没有正式评估，项目仍然只能证明“链路存在”，还不能回答：
- candidate 生成是否稳定
- distillation success / retry / discard 是否健康
- inject 是否带来净收益
- governance 是否真的在工作

## What Changes

- 新增 OpenClaw-first 基线评估 capability，定义评估对象、指标口径和输出产物。
- 增加本地可执行的 baseline evaluation 服务与 CLI 入口，用于读取 ExperienceEngine 当前托管状态并生成评估快照。
- 增加 OpenClaw 基线评估使用手册，说明如何在当前 WSL 的真实 OpenClaw 上执行最小验收。
- 生成并保留首份本地 baseline 快照产物，用作后续迭代的对比基线。

## Capabilities

### New Capabilities
- `openclaw-baseline-evaluation`: 定义 OpenClaw-first 基线评估的指标、命令入口与产物约束。

## Impact

- 受影响代码：新增 `evaluation` 服务与 CLI `evaluate` 命令。
- 受影响文档：新增 OpenClaw baseline 评估说明，并在 README / user guide 中链接。
- 受影响运行方式：当前 WSL 的真实 OpenClaw 环境会被用作第一轮评估基线来源。
