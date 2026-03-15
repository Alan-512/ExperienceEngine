## Context

当前公开仓库已经形成了较厚的产品层：
- OpenClaw / Claude Code / Codex 三宿主都具备真实接入
- MCP-native 交互面、CLI fallback、install/doctor/repair/upgrade、backup/export/import/rollback 已完成
- 经验治理后半段已经较强：inject、feedback、cooling、retired、inspect/manage 都存在

但 v3 文档重新收口后的主线要求与当前实现有两个明显偏差：
- 经验前半段仍然是 `finalize -> 同步规则提炼 -> node`，缺少正式 Candidate / DistillationJob / async distill 生命周期
- 宿主策略已经变成多宿主等权产品化，而 v3 要求当前阶段把 OpenClaw 设为经验内核的验证基准宿主

因此本次 change 不回收现有产品壳，而是在方案 B 下重构内核：保留多宿主产品接入，重新把核心学习链、评估基线和优先级收回到 OpenClaw-first 与 async distillation。

## Goals / Non-Goals

**Goals:**
- 建立正式 `ExperienceCandidate` 和 `DistillationJob` 持久化层，拆开原始信号、候选、正式节点、治理状态。
- 把当前同步 finalize 分析链改成 candidate-first、async-distill-later。
- 用 LLM-first distillation 取代当前规则直接生成正式经验表达的主路径。
- 明确 OpenClaw 是经验内核验证基准宿主，Claude/Codex 继续复用产品壳与交互面。
- 从当前主产品面移除 `ee remember` 与 MCP manual remember。
- 重建围绕 candidate/distill/inject/feedback/retire 的评估链路。

**Non-Goals:**
- 不回收现有 Claude/Codex 接入、MCP 交互面、installer/doctor/upgrade/backup 等产品能力。
- 不在本次 change 中做团队共享经验、artifact 写回、skill promotion、memory/context engine 替代。
- 不把 OpenClaw 重新做成唯一宿主，只把它设为基准实验宿主。
- 不在本次 change 中重新设计 UI，只要求 review/inspect 面遵守 candidate 不可见规则。

## Decisions

### 1. 保留多宿主产品壳，但收回内核验证基线到 OpenClaw
保留 Claude/Codex 的安装、MCP 和运行时接入，因为这些已经是既有资产；但 candidate、async distill、cold-start、eval 的严谨基线先只在 OpenClaw 上定义和验收。

备选方案：
- 方案 A：回收 Claude/Codex，彻底只做 OpenClaw。缺点是浪费既有产品化投入。
- 当前方案 B：不回收产品壳，只收回验证中心。优点是兼顾现有成果和 v3 的实验严谨性。

### 2. 正式引入 `ExperienceCandidate` 与 `DistillationJob`
当前 `ExperienceCandidate` 只是分析阶段对象，无法承载 pending/failed/discarded/retry 生命周期。新设计要求：
- Task 结束时只生成 Candidate
- Candidate 入队生成 DistillationJob
- DistillationJob 异步调用 LLM，成功后写正式 ExperienceNode
- Candidate 和 Job 都需要持久化与可审计状态

备选方案：
- 继续沿用 input record + node 直写。缺点是无法表达异步提炼失败、重试、丢弃，也与 v3 施工图不一致。

### 3. LLM-first distillation，规则只做 gate 和治理
当前规则增强 extractor 可以保留，但角色要降级成：
- 预筛选 candidate 是否值得提炼
- 风险边界与 fallback
- 治理状态机

正式 `compact_hint / actionable_form / guidance_type / risk_level` 应由 distiller model 生成。

备选方案：
- 继续提升规则 extractor。缺点是会继续把 EE 固定在“规则增强版”，与 v3 的质量上限不一致。

### 4. 删除当前阶段的 manual remember 主入口
`ee remember` 和 MCP remember 已经进入主产品面，但 v3 当前阶段明确不做用户手工补写经验。为了避免把系统学习与手工写入混成同一路，需要把这两条入口从当前主产品面删除。

备选方案：
- 仅隐藏入口但保留能力。缺点是行为仍存在，边界不清晰。
- 当前方案：从主产品中移除，未来若恢复，以新 change 重新定义。

### 5. 评估链路围绕全闭环重建
新的评估重点不是“功能是否存在”，而是：
- candidate 生成率
- distillation success / retry / discard
- inject 命中与 skip 质量
- helped/harmed 净收益
- cooling/retired 的实际发生

并且第一套严谨验收只要求 OpenClaw 达成。

## Risks / Trade-offs

- [多宿主产品面与 OpenClaw-first 基线之间的表述冲突] → 在文档和 spec 中明确“多宿主保留，OpenClaw 是核心验证基准宿主”。
- [Candidate / Job 持久化会引入数据迁移和更多状态复杂度] → 通过新增表和 additive migration 处理，避免破坏现有 node 数据。
- [LLM-first distillation 可能引入成本与稳定性问题] → 采用模型档位策略与 retry/discard 机制，并保留规则 gate 降低无效提炼量。
- [删除 remember 会影响当前少量调试路径] → 通过 git 历史保留实现，不在主产品面暴露；必要时用 fixture 或测试 helper 替代。
- [OpenClaw 基线验证可能拖慢 Claude/Codex 新功能推进] → 把这视为阶段性约束，只限制内核实验，不限制宿主复用层维护。

## Migration Plan

1. 文档和 spec 先收口：
   - OpenClaw-first baseline
   - Candidate/Job/async distill
   - 移除 manual remember
2. 删除 CLI 与 MCP manual remember 入口，并更新用户文档。
3. 增加 Candidate / DistillationJob 数据表、repository、migration。
4. 将 runtime finalize 改成：
   - 记录 TaskRun / Outcome
   - 生成 Candidate
   - 入 DistillationJob
   - 后台异步 distill 后写 Node
5. 用 OpenClaw 跑首套 candidate/distill/inject/feedback/retire 基线评估。
6. Claude/Codex 在不改主交互层的前提下复用新的内核对象与结果面。

## Open Questions

- `TaskRun / OutcomeRecord / ReviewEvent` 是否在本次 change 中全部实体化，还是先最小引入 Candidate / DistillationJob。
- distillation queue 是先用 SQLite-backed pull queue 还是单进程异步 worker。
- extractor model profile 的配置面是否直接复用现有 config schema，还是新增独立 distillation profile 字段。
- Claude/Codex 是否需要立即跟进 candidate/job inspect 资源，还是先只要求 OpenClaw 验收通过。
