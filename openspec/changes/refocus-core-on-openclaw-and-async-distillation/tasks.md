## 1. Contract Realignment

- [x] 1.1 更新主文档和 OpenSpec 描述，明确 `OpenClaw = 内核验证基准宿主`，`Claude/Codex = 复用宿主`
- [x] 1.2 删除 `ee remember` CLI 入口和相关帮助文案
- [x] 1.3 删除 MCP manual remember tool 与 prompt，并更新用户文档和手册

## 2. Candidate And Job Persistence

- [x] 2.1 新增 `ExperienceCandidate` 持久化表、repository 和 schema migration
- [x] 2.2 新增 `DistillationJob` 持久化表、repository 和状态字段
- [x] 2.3 为 candidate/job 增加 `pending / distilled / failed / discarded / retry_count` 生命周期支持

## 3. Runtime Refactor

- [x] 3.1 将 OpenClaw finalize 主链改成 `TaskRun/Outcome -> Candidate`，不再同步直写正式 node
- [x] 3.2 建立异步 distillation worker/queue，支持提炼、重试、丢弃
- [x] 3.3 将当前规则 extractor 降级成 pre-filter / boundary 角色

## 4. LLM-first Distillation

- [x] 4.1 增加 distiller model profile 配置和调用边界
- [x] 4.2 实现 candidate -> LLM distillation -> ExperienceNode 落地
- [x] 4.3 确保未提炼 candidate 与 discarded candidate 不进入 inspect/review 用户面

## 5. Governance And Evaluation

- [x] 5.1 调整 feedback/state-transition 以适配 candidate-first、node-later 链路
- [x] 5.2 增加围绕 `candidate / distill / inject / feedback / retire` 的指标与审计输出
- [x] 5.3 建立 OpenClaw-first 冷启动与高置信场景验收清单

## 6. Host Reuse Alignment

- [x] 6.1 让 Claude/Codex 复用新的 candidate/job/node 内核对象，而不改变其现有安装和交互入口
- [x] 6.2 明确 Claude/Codex 当前阶段不作为等权内核实验基线
- [x] 6.3 跑 OpenClaw 主验收，再补 Claude/Codex 回归验证
