## Why

ExperienceEngine 现在已经具备多宿主产品壳和 MCP/CLI 管理面，但 v3 方案要求把当前阶段的重点重新收回到经验内核本身：`candidate -> async distill -> node -> inject -> feedback -> retire`。如果不先补齐 Candidate、异步提炼、LLM-first 提炼和 OpenClaw-first 评估基线，项目仍然更像规则增强版治理工具，而不是 v3 定义下的经验介入治理层。

## What Changes

- 引入正式的 `ExperienceCandidate` 持久化对象和 `DistillationJob` 生命周期，拆开 capture、distill、node 三层。
- 将当前同步 `finalize -> analyze -> node` 主链改为 `finalize -> candidate -> async distill -> node`，并保证未提炼 candidate 不进入用户面。
- 将经验表达主路径改为 `LLM-first distillation`，规则只负责筛选、风险边界和治理状态机。
- 将 OpenClaw 明确设为经验内核验证基准宿主，用于冷启动、candidate、async distill、inject、feedback、retire 的第一套严谨评估。
- 保留 Claude/Codex 的产品接入和 MCP 交互层，但将它们降级为复用宿主，不作为当前内核实验的等权验证面。
- **BREAKING** 删除当前阶段的 `ee remember` 与 MCP manual remember 主产品入口，手工经验补写不再属于当前核心范围。

## Capabilities

### New Capabilities
- `experience-candidate-distillation`: 定义正式 candidate、distillation job、异步提炼与丢弃生命周期。

### Modified Capabilities
- `experience-learning-quality`: 将经验质量主路径收口为 LLM-first distillation，并移除当前阶段的用户手工经验主能力。
- `openclaw-experience-plugin`: 将 OpenClaw 收口为经验内核验证基准宿主，并把持久化主链改为 candidate-first、async-distill-later。
- `mcp-native-interaction-surface`: 移除当前阶段的 manual remember MCP workflow，并明确 Claude/Codex 的 MCP 面是复用交互层而非核心验证基线。

## Impact

- 受影响代码：`runtime/service`、`analyzer/*`、SQLite schema/repositories、队列/任务调度、OpenClaw adapter、Claude/Codex 复用路径、CLI/MCP surface。
- 受影响数据：需要新增 Candidate / DistillationJob 相关表或等价持久化对象，并迁移当前 node 直写逻辑。
- 受影响产品面：删除 `ee remember` 和 MCP remember，调整 inspect/review 文案与用户手册。
- 受影响验证：需要围绕 OpenClaw-first 基线重建 candidate/distill/inject/feedback/retire 的评估路径。
