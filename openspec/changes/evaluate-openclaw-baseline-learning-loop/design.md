## Context

v3 当前阶段不再缺核心内核对象，下一步重点是把 OpenClaw-first 的 learning loop 跑成一条可衡量的基线。已有实现已经具备：
- OpenClaw runtime capture
- candidate / distillation job / node persistence
- inject / feedback / retire
- Claude/Codex 的复用与回归路径

但目前缺少一个稳定的“评估面”来把这些状态组织成一份可读、可比、可重复的 baseline。

## Goals / Non-Goals

**Goals**
- 提供一个针对当前本地 product state 的 OpenClaw 基线评估入口。
- 输出至少包含 record / candidate / distillation / node / feedback 五层指标。
- 将评估产物同时写成 JSON 和 Markdown，便于机器消费与人工阅读。
- 在当前 WSL 的真实 OpenClaw 环境生成一份首轮 baseline 快照。

**Non-Goals**
- 不在本次 change 中引入新的学习算法。
- 不做云端评估系统，不做远程服务器评估编排。
- 不把评估结果提交进公开仓库；结果作为本地产物保留。
- 不在本次 change 中构建复杂 dashboard。

## Decisions

### 1. 评估入口以 CLI 为主，产物落本地 artifacts
为了便于当前 WSL 中反复执行，使用 `ee evaluate openclaw-baseline` 作为统一入口。

命令默认把结果写到本地：
`artifacts/evaluations/openclaw/<timestamp>/`

同时输出：
- `summary.json`
- `summary.md`

### 2. 评估基于当前 SQLite 与托管状态快照
本次评估不重新发明状态采集，而是直接复用：
- `experience_input_records`
- `experience_candidates`
- `distillation_jobs`
- `experience_nodes`
- 当前 config / paths

### 3. 指标先做全量快照，再考虑时间窗口
第一版先输出“当前累计状态快照”，包含：
- records 总量与 outcome 分布
- candidate lifecycle 分布
- distillation job 状态分布
- node state 分布
- injection coverage
- feedback coverage

时间窗口过滤作为可选参数，避免第一版过度复杂。

### 4. OpenClaw 继续作为唯一评估基准宿主
评估服务名称和文档都显式写明：
- 当前 baseline 只面向 OpenClaw
- Claude/Codex 仍只做回归复用，不参与当前基线判定

## Risks / Trade-offs

- [历史数据会影响当前基线观感] → 第一版接受“累计快照”模式，并在报告中写清快照时刻与数据库路径。
- [本地产物容易污染仓库] → 默认写到 `artifacts/`，并加入 `.gitignore`。
- [单份快照不能说明趋势] → 报告中明确它只是 baseline snapshot，后续需继续对比。

## Implementation Outline

1. 新增 `openclaw-baseline-evaluation` spec。
2. 实现 `src/evaluation/openclaw-baseline.ts`，负责汇总指标与渲染 Markdown。
3. 实现 CLI 命令 `ee evaluate openclaw-baseline [--lookback-hours N] [--output-dir PATH]`。
4. 新增测试，验证汇总逻辑和命令输出。
5. 新增开发文档，说明如何在当前 WSL 的真实 OpenClaw 上执行。
6. 在当前环境运行一轮命令，生成本地 baseline 快照。
