# ExperienceEngine 架构优化路线图

> 版本：v2  
> 面向对象：ExperienceEngine 项目后续架构优化、产品定位收敛、Coding Agent 执行改造  
> 核心目标：把 ExperienceEngine 从“复杂的 agent 记忆/治理平台雏形”收敛成一个清晰、优雅、高效的“项目经验管理系统”。
> 执行原则：本文是架构北极星和分阶段路线，不是一轮一次性大重构计划。

---

## 0. 一句话结论

ExperienceEngine 的方向是正确的：它不应该成为通用记忆系统，也不应该追求“记得更多”。它应该成为一个项目级经验治理系统：

```text
不是让 agent 记住更多，
而是让经过验证的项目经验，
在合适的时候，
以最小形式干预下一次执行。
```

因此，本轮优化的核心不是继续增加功能，而是收敛主路径、隔离复杂度、强化经验准入、优化注入克制性，并把 helped / harmed / cooling / retired 这套治理闭环做成系统核心。

---

## 0.1 审查结论

本方案方向成立，但不能作为一次性实施计划直接执行。

应该采纳为长期架构路线图，并拆成多个小的、可验证的 change：

```text
1. clarify-ee-core-architecture
2. harden-learning-gate
3. split-runtime-services
4. tighten-injection-policy
5. explain-skipped-interventions
```

执行时必须遵守三条约束：

```text
1. 先改变边界和行为规则，再考虑目录大搬迁。
2. 任何 runtime 拆分都必须保留 facade，并保持 host adapter 行为不变。
3. 新增概念优先做成派生解释层，避免立刻扩大持久化状态机。
```

---

## 1. 当前架构目标重新定义

### 1.1 ExperienceEngine 不是通用记忆系统

ExperienceEngine 不负责保存所有用户对话、偏好、事实、笔记、代码片段或普通历史记录。

它应该只关心一类东西：

```text
对未来类似 coding task 有执行价值的项目经验。
```

例如：

```text
当 SQLite 启动失败时，先执行 migration，再打开 DB connection。
当 integration test timeout 时，先检查 mock，而不是先调连接池。
当 provider routing 出错时，不要先修 UI 层，要先验证 provider selection path。
```

这些不是普通事实，而是“未来 agent 执行任务时应该避免或遵循的路径”。

---

### 1.2 ExperienceEngine 的正确心智模型

推荐把 EE 的架构固定成下面这条主路径：

```text
真实任务
  ↓
提取关键任务信号
  ↓
判断是否值得学习
  ↓
生成项目经验节点
  ↓
相似任务时注入短 guidance
  ↓
根据结果强化 / 降温 / 退役
```

这条主路径必须永远清晰。任何新功能都只能作为这条主路径的辅助，而不能反过来污染主路径。

---

## 2. 当前架构的主要优点

### 2.1 定位比通用 memory 更清晰

通用 memory 系统常见路径是：

```text
所有事件都记录
  ↓
压缩
  ↓
检索
  ↓
注入
  ↓
后续再清理
```

ExperienceEngine 的定位更好：

```text
记录任务历史
  ↓
筛选有复用价值的任务
  ↓
生成 candidate
  ↓
治理 candidate 是否可以成为 active guidance
  ↓
只在相关任务中短小干预
```

这使得 EE 天然比“全量记忆系统”更适合作为 coding agent 的项目经验层。

---

### 2.2 已经具备优秀架构的核心对象

目前 EE 的核心对象方向是正确的：

```text
Task Record
Learning Candidate
Experience Node
Injection Event
Attribution Record
Review Event
Repo Policy
Scope Task Stats
```

这些对象不是围绕“记忆内容”设计的，而是围绕“经验是否值得继续影响未来任务”设计的。

这说明 EE 的底层方向是“经验治理”，不是“内容堆积”。

---

### 2.3 ExperienceNode 设计方向正确

一个好的 ExperienceNode 应该包含：

```text
trigger_pattern：什么情况下触发
compact_hint：最短可复用提示
goal：它想帮助完成什么
recommended_steps：成熟后可展开的执行步骤
avoid_steps：已经证明浪费或有害的路径
success_signal：应用成功应该看到什么
evidence_summary：这条经验为什么存在
state：candidate / active / cooling / retired
delivery_state：shadow_only / conservative_only / eligible / quarantined
helped_count / harmed_count：历史效果
```

这比普通 memory 的 `title + content` 更适合 coding agent。

---

### 2.4 注入策略方向正确

EE 的注入应该坚持：

```text
默认只注入 compact_hint
默认最多 1 条，必要时最多 3 条
成熟节点才允许展开 Goal / Steps / Avoid
不把完整历史塞进 prompt
不把所有匹配内容都注入
```

这非常重要。项目经验管理系统的价值不是“召回很多”，而是“在关键时刻用一句短提示避免重复试错”。

---

## 3. 当前架构的主要问题

### 3.1 功能面已经偏重，主路径有被稀释的风险

当前项目里已经有较多周边能力：

```text
OpenClaw / Claude Code / Codex adapter
CLI
MCP server
doctor
install / repair / upgrade
brokered actions
hygiene
export drafts
hybrid postmortem
repo policy
embedding provider
reranker
second opinion
```

这些能力并不是错，但它们会带来三个风险：

```text
1. 用户第一眼看不懂 EE 到底解决什么问题
2. 开发者后续维护成本上升
3. agent 调用工具时选择面过宽，核心行为不稳定
```

优化方向不是删除所有功能，而是明确分层：

```text
核心主路径：日常必须稳定
Operator 层：诊断、安装、维护
Experimental 层：hybrid、second opinion、advanced review
```

---

### 3.2 ExperienceRuntimeService 职责过大

当前 `ExperienceRuntimeService` 同时承担了多类职责：

```text
session state
tool event dedupe
input finalization
task run / outcome / input record persistence
learning gate loading
distillation worker loading
hybrid worker loading
postmortem artifact
feedback application
capture writer
repo policy
injection event
```

这会导致一个问题：系统越长大，核心 runtime 越像“总线式巨类”。

优化目标：

```text
把 Runtime 拆成稳定的 3 个核心服务：
1. PromptInterventionService
2. TaskFinalizationService
3. LearningPipelineService
```

---

### 3.3 Learning Gate 仍然过度依赖 LLM 判断

当前 Learning Gate 已经有很好的 prompt 和过滤逻辑，但它仍然存在风险：

```text
LLM 可能过度泛化
LLM 可能把普通任务总结成经验
LLM 可能漏掉真正重要的经验
LLM 可能生成 generic advice
LLM 可能生成字段不稳定的 candidate
```

因此，学习准入必须更“硬”。

原则：

```text
LLM 可以参与总结，但不能单独决定是否值得长期学习。
系统应该先用规则判断是否具备学习资格，再让 LLM 做结构化提炼。
```

---

### 3.4 ExperienceNode schema 可能过度结构化

当前 ExperienceNode 字段很完整，但对早期 candidate 来说可能太重。

风险：

```text
很多字段为空
字段之间语义重叠
LLM 为了填字段而编造
trigger_pattern / compact_hint / evidence_summary / retrieval_text 边界模糊
recommended_steps 和 compact_hint 不一致
```

建议把 candidate 和 mature node 的字段区分开。

---

### 3.5 多 host 支持会提前放大复杂度

支持 OpenClaw、Claude Code、Codex 是长期优势，但短期会带来：

```text
不同 hook 能力不同
sessionId / cwd / tool result 格式不同
注入时机不同
安装方式不同
doctor / repair 复杂
真实体验不一致
```

因此，短期重点不应该是“支持更多 host”，而是先保证一个主 host 的核心闭环稳定。

建议策略：

```text
主验证 host：OpenClaw 或 Codex 二选一
其他 host：保持兼容，但不要作为核心设计驱动力
```

---

## 4. 优化后的目标架构

### 4.1 四层主架构

推荐将 EE 的长期架构收敛成四层：

```text
Host Adapter Layer
  ↓
Task Runtime Layer
  ↓
Experience Learning Layer
  ↓
Intervention Governance Layer
```

更具体地说：

```text
Host Adapter
  只负责接入 OpenClaw / Claude Code / Codex
  不做复杂业务判断

Runtime Capture
  只负责收集任务信号和关键工具结果
  不直接生成长期经验

Learning Gate
  判断任务是否值得学习
  不值得学：只留 task record
  值得学：生成 candidate

Distillation
  把 candidate 变成 experience node
  只输出结构化执行经验

Retrieval + Policy
  找相关经验
  判断是否安全、是否同 scope、是否同任务类型

Intervention
  只注入短 guidance
  默认 compact_hint
  成熟节点才展开 steps / avoid

Feedback + Governance
  helped / harmed / uncertain
  active / cooling / retired / quarantined
```

---

### 4.2 推荐目录结构

下面的目录结构是长期目标，不是第一阶段任务。

第一阶段不应该先搬目录。先在现有目录中抽出边界清晰的服务和接口，等行为稳定、测试覆盖充分后，再做低风险迁移。

建议逐步演进到如下结构：

```text
src/
  adapters/
    openclaw/
    claude-code/
    codex/

  core/
    runtime/
      session-state.ts
      task-finalization-service.ts
      prompt-intervention-service.ts

    learning/
      learning-gate.ts
      candidate-builder.ts
      candidate-quality.ts
      distillation-service.ts

    experience/
      experience-node.ts
      node-quality.ts
      lifecycle-governance.ts
      delivery-policy.ts

    retrieval/
      retrieval-context.ts
      candidate-retriever.ts
      match-scorecard.ts
      policy-enricher.ts

    feedback/
      attribution-service.ts
      feedback-manager.ts
      harm-detector.ts

  store/
    sqlite/
    vector/

  cli/
  mcp/
  operator/
  experimental/
    hybrid/
    second-opinion/
```

关键点：

```text
core/ 只放产品主路径
operator/ 放 doctor / repair / install / export / hygiene
experimental/ 放 hybrid / second opinion / advanced review
adapters/ 只做 host 适配，不放核心判断
```

迁移约束：

```text
1. 不为了目录美观移动尚未稳定的代码。
2. 不在同一个 change 中同时做行为变化和大规模文件搬迁。
3. public CLI、MCP 工具名、host hook 行为、安装/修复路径必须保持兼容。
4. 每次迁移都必须能通过现有 host adapter 回归测试。
```

---

## 5. 核心改造方案

## 5.1 改造一：严格学习准入

### 当前问题

现在 EE 已经有“不要学普通事实/文案修改”的原则，但实际系统仍需要更强的硬门槛。

### 目标

只有真正具有项目执行复用价值的任务，才允许进入 candidate。

这里的“硬门槛”不是只学习失败任务。它的目标是拒绝低信号任务，同时保留少量高置信成功路径。

普通成功任务默认不学；但如果一次成功任务明确产生了可复用的项目约束、发布流程、宿主兼容规则、验证顺序或安全边界，也可以进入候选，但必须带有可验证证据。

### 推荐准入规则

一个任务只有满足下面任一条件，才允许进入 learning candidate：

```text
1. 失败 -> 修复 -> 成功
2. 多次失败 / 多次 retry 后找到路径
3. 用户明确纠正 agent 的方向、边界、质量标准、验证顺序
4. 有客观验证信号：test / build / typecheck / doctor / integration check 结果变化
5. 同类任务已经重复出现过
6. 出现明确错误签名，并且后续有可复用处理方式
7. 成功任务产生了明确、可复用、可验证的项目执行约束
```

不满足这些条件的任务：

```text
只保存 task record
不生成 candidate
不进入 retrieval
不参与 injection
```

### 伪代码

```ts
function shouldCreateLearningCandidate(input: ExperienceInput): LearningGateDecision {
  const signals = buildCandidateSignals(input)

  if (isExpressionLayerOnly(input)) {
    return reject("expression_layer_only")
  }

  if (!hasSubstantiveToolEvidence(input)) {
    return reject("insufficient_substantive_evidence")
  }

  if (hasFailureThenSuccess(input)) {
    return accept("failure_repair_success")
  }

  if (signals.retry_count >= 2) {
    return accept("retry_pattern")
  }

  if (signals.directional_correction?.detected) {
    return accept("directional_correction")
  }

  if (hasObjectiveVerificationChange(input)) {
    return accept("objective_verification_change")
  }

  return reject("no_transferable_execution_value")
}
```

### 验收标准

```text
普通文案修改：不生成 candidate
普通成功任务：不生成 candidate
一次失败后成功修复：生成 candidate
多次 retry 后成功：生成 candidate
用户纠正方向后成功：生成 candidate
```

---

## 5.2 改造二：拆分 Runtime 巨类

### 当前问题

`ExperienceRuntimeService` 职责过多，是未来复杂度的中心。

### 目标拆分

#### PromptInterventionService

只负责：

```text
beforePromptBuild
构造 ExperienceInput
检索候选节点
调用 intervention-controller
持久化 injection event
返回 compact hint
```

#### TaskFinalizationService

只负责：

```text
persistToolResult
recoverToolEvents
finalizeTask
写入 task_runs / outcome_records / input_records
触发 learning pipeline
```

#### LearningPipelineService

只负责：

```text
learning gate
candidate creation
distillation job
candidate -> node
posttask review
```

#### GovernanceService

只负责：

```text
feedback
attribution
node state transition
delivery state update
quarantine / cooling / retired
```

### 改造顺序

```text
第一步：先抽出 TaskFinalizationService
第二步：再抽出 PromptInterventionService
第三步：最后把 LearningPipelineService 从 runtime 中独立出来
第四步：保留 ExperienceRuntimeService 作为 facade
```

### 目标调用关系

```text
ExperienceRuntimeService
  ├── PromptInterventionService
  ├── TaskFinalizationService
  ├── LearningPipelineService
  └── GovernanceService
```

`ExperienceRuntimeService` 最终只做编排，不再承载具体业务逻辑。

---

## 5.3 改造三：Candidate 与 Node 分层

### 当前问题

现在 candidate 和 node 的 schema 太接近，容易导致早期候选过度结构化。

### 建议区分

#### LearningCandidate 最小字段

```ts
type LearningCandidate = {
  id: string
  scope_id: string
  task_type: TaskType
  candidate_kind: "failure" | "retry_pattern" | "correction" | "successful_fix"
  trigger_pattern: string
  compact_hint: string
  evidence_summary: string
  success_signal: string
  source_signal: CandidateSourceSignal
  lifecycle_state: "pending" | "distilled" | "failed" | "discarded"
}
```

#### ExperienceNode 成熟字段

```ts
type ExperienceNode = {
  id: string
  trigger_pattern: string
  compact_hint: string
  goal?: string
  recommended_steps?: string[]
  avoid_steps?: string[]
  fallback_steps?: string[]
  success_signal: string
  evidence_summary: string
  state: "candidate" | "priority_candidate" | "active" | "cooling" | "retired"
  delivery_state: "shadow_only" | "conservative_only" | "eligible" | "quarantined"
  helped_count: number
  harmed_count: number
  support_count: number
}
```

### 关键原则

```text
Candidate 只要求“能判断是否值得继续加工”
Node 才要求“能参与未来注入”
Mature Node 才允许展开步骤
```

落地约束：

```text
1. 不先删字段，不先做破坏性 schema 迁移。
2. 先定义 candidate 最小质量契约，再让 distillation 输出满足该契约。
3. 当前 experience_nodes 仍是检索、注入、治理的唯一生产单元。
4. candidate 默认不进入注入路径，只能作为 diagnostics / learning pipeline 输入。
```

---

## 5.4 改造四：引入质量分层 Quality Band

### 当前问题

当前 state / delivery_state 很强，但用户和 agent 仍需要一个更直观的质量信号。

### 建议增加

```ts
type QualityBand = "low" | "medium" | "high"
```

`QualityBand` 初期应作为派生解释层，而不是新的持久化真相源。

当前系统已经有：

```text
state: candidate / priority_candidate / active / cooling / retired
delivery_state: shadow_only / conservative_only / eligible / quarantined
validation_state
helped_count / harmed_count / support_count
```

因此 `QualityBand` 的第一版应该从这些字段计算出来，用于 `inspect`、`repo summary` 和 no-injection explanation。只有当派生规则稳定并证明有产品价值后，才考虑是否持久化。

### 质量分层规则

```text
low：
  只记录，不注入
  或只进入 shadow

medium：
  conservative_only
  只注入 compact_hint
  不展开 steps

high：
  eligible
  可正常注入
  允许在必要时展开 Goal / Steps / Avoid
```

### 计算依据

```text
helped_count
harmed_count
support_count
validation_state
scope_match
task_family_match
negative_evidence
recent harm
objective verification
user confirmation
```

### 用户可见表达

`ee inspect node:<id>` 应该显示：

```text
Quality: high
Why: same repo, same task family, 3 helped, 0 harmed, validated by reuse
Delivery: eligible
Recommended use: safe to inject compact hint
```

---

## 5.5 改造五：注入策略进一步克制

### 当前原则

默认注入 `compact_hint` 是正确的。

### 建议进一步明确

#### 默认策略

```text
每次任务最多注入 1 条 compact_hint
只有 strong candidate fast path 才可以注入 2 条
绝不注入完整历史
绝不注入 raw task record
绝不把 candidate 直接注入
```

#### 注入模板

```text
ExperienceEngine found a prior project experience:
- {compact_hint}

Reason:
- same repo / same task family / prior success signal
```

#### 成熟节点扩展模板

只有 high quality node 才允许：

```text
ExperienceEngine guidance:
- Hint: {compact_hint}
- Goal: {goal}
- Avoid: {avoid_steps}
- Success signal: {success_signal}
```

### 验收标准

```text
普通匹配：只注入 1 条 compact_hint
低置信匹配：不注入，或 conservative 注入
候选节点：默认不注入，只做 diagnostic record
成熟节点：可受控展开
```

---

## 5.6 改造六：强化“为什么没有注入”

### 当前问题

用户看到“没注入”可能会误以为系统没工作。

### 目标

“没有注入”也应该是一个可解释的决策。

### 推荐 skipped reason

```text
no_candidate
unknown_task_type
low_signal_input
scope_disabled
candidate_not_mature
delivery_state_shadow_only
semantic_match_but_policy_rejected
task_family_mismatch
negative_evidence
recent_harm
repo_policy_strict
holdout_suppressed
```

### 用户可见表达

```text
ExperienceEngine did not inject this time.

Reason:
- A similar candidate exists, but it is still shadow_only.
- It needs one successful reuse or stronger support before affecting prompts.

Next:
- Continue the task normally.
- If this pattern repeats, EE may promote it later.
```

这个能力非常重要，因为它能体现 EE 的克制和治理价值。

---

## 5.7 改造七：Operator / Advanced 功能隔离

### 当前问题

doctor、repair、install、hygiene、export、hybrid、second opinion 等功能都很有用，但不应该进入主路径心智。

### 建议分层

```text
Routine Surface:
  lookup_hints
  record_tool_result
  finalize_task
  explain_last_decision
  feedback_last

Operator Surface:
  status
  doctor
  repair
  install
  backup
  export
  import
  hygiene

Experimental Surface:
  hybrid
  second opinion
  postmortem review
  export drafts
```

### MCP 工具也应分层

MCP capabilities 可以明确告诉 host agent：

```text
Core tools:
- experienceengine_lookup_hints
- experienceengine_record_tool_result
- experienceengine_finalize_task
- experienceengine_explain_last_decision
- experienceengine_feedback_last

Read-only resources:
- experienceengine://last
- experienceengine://repo-summary
- experienceengine://review

Advanced brokered actions:
- install / repair / export / hygiene / hybrid
```

目标是让 agent 在日常任务中只看到少量核心工具。

---

## 6. 建议的执行路线

该路线应按独立 change 执行，不应一次性合并成一个大重构。

推荐拆分为：

```text
1. clarify-ee-core-architecture
2. harden-learning-gate
3. split-runtime-services
4. tighten-injection-policy
5. explain-skipped-interventions
```

顺序说明：

```text
- harden-learning-gate 必须早于 split-runtime-services，否则拆分会固化旧的学习行为，再被迫二次调整边界。
- tighten-injection-policy 应早于 explain-skipped-interventions，否则 skip reason taxonomy 会被后续注入策略收紧再次改写。
```

每个 change 都必须说明：

```text
- 会改哪些文件
- 不会改哪些文件
- 哪些行为必须保持不变
- 哪些测试需要新增或更新
- 如何验证现有 host adapter 行为没有改变
```

---

## Phase 1：收敛核心概念与文档

目标：先统一项目心智。

任务：

```text
1. 使用 docs/development/architecture.md 作为当前架构蓝图
2. 明确 EE 四层架构
3. 明确 Routine / Operator / Experimental 分层
4. 把“不是通用 memory”写入开发文档
5. 明确学习准入标准
```

验收：

```text
新开发者 10 分钟内能理解：
- EE 不是 memory
- task record 和 experience node 的区别
- 为什么不是什么都学
- 为什么不是什么都注入
```

---

## Phase 2：Learning Gate 硬门槛

目标：减少低价值 candidate。

任务：

```text
1. 新增 shouldCreateLearningCandidate
2. 把 expression-layer-only、insufficient evidence 作为硬拒绝
3. 增加 objective verification / failure repair / retry pattern / directional correction 规则
4. 给每个 rejected task 写 learning_reason
5. 保留高置信成功任务的有限准入路径
6. 增加测试覆盖
```

验收：

```text
普通文案任务不会进入 candidate
普通成功任务不会进入 candidate
失败修复路径能进入 candidate
用户纠正方向能进入 candidate
有客观验证的项目约束能进入 candidate
```

---

## Phase 3：拆分 Runtime Service

目标：降低核心复杂度。

该阶段只做职责拆分，不改变外部行为。

任务：

```text
1. 抽出 TaskFinalizationService
2. 抽出 PromptInterventionService
3. 抽出 LearningPipelineService
4. 保留 ExperienceRuntimeService facade
5. 不改变 CLI / MCP / host adapter 的入口签名
6. 增加回归测试，确保行为不变
```

验收：

```text
ExperienceRuntimeService 不再直接包含大量 learning / retrieval / governance 细节
每个服务文件职责单一
测试仍全部通过
```

---

## Phase 4：Quality Band 与解释面

目标：让系统行为更可理解。

任务：

```text
1. 增加 deriveNodeQualityBand，作为派生解释层
2. inspect node 显示 quality band
3. inspect --last 显示 skipped reason
4. repo summary 显示 active/cooling/quarantined 质量分布
5. 暂不把 QualityBand 作为新的持久状态源
```

验收：

```text
用户能看懂：
- 为什么注入
- 为什么没注入
- 这条经验是否值得信任
- 这条经验下一步会如何变化
```

---

## Phase 5：注入策略收紧

目标：减少 prompt 污染。

任务：

```text
1. 默认只注入 1 条 compact_hint
2. high quality 才允许结构化展开
3. conservative injection 永远只注入 compact_hint
4. 增加注入长度限制
5. 增加注入快照测试
6. 明确 candidate 永不直接注入
```

验收：

```text
没有任何路径会注入 raw history
普通路径不会注入多条冗余 guidance
成熟节点扩展内容有明确 gate
```

---

## Phase 6：Host 支持降复杂度

目标：避免多 host 把核心打散。

这不是降低现有 host 支持等级。OpenClaw、Claude Code、Codex 仍然是公开支持面。

这里的目标是：核心设计不再被 host 差异牵着走，host-specific 复杂度只留在 adapter / install / repair 层。

任务：

```text
1. 选定一个主验证 host 作为核心闭环质量基准
2. 其他 host adapter 保持兼容和回归测试，不主动扩展新能力
3. 把 host-specific 逻辑限制在 adapters/
4. 核心服务只接受统一 HostPromptContext / ToolEvent / ExperienceInput
5. install / repair / doctor 仍然按 host 分别维护
```

验收：

```text
core/ 不出现 host-specific 判断
adapter 层负责格式转换
核心测试不依赖具体 host
```

---

## 7. Coding Agent 执行提示词

下面是一段可以直接给 Codex / Claude Code / OpenClaw 的执行 prompt。

```text
你正在优化 ExperienceEngine。请严格遵守以下架构目标：

ExperienceEngine 不是通用记忆系统，而是项目经验管理系统。
它的核心闭环是：
真实任务 -> 任务信号 -> 学习准入 -> candidate -> experience node -> 短 guidance 注入 -> helped/harmed 治理。

本轮改造目标：
1. 不新增产品功能。
2. 收敛核心架构。
3. 强化 Learning Gate，避免普通任务进入 candidate。
4. 拆分 ExperienceRuntimeService 的职责。
5. 让 Routine / Operator / Experimental 能力分层更清楚。
6. 保持现有测试通过。
7. 不先做目录大搬迁。
8. 不改变现有 host adapter 的外部行为。

请先阅读：
- docs/development/experience-model.md
- src/runtime/service.ts
- src/runtime/prompt-service.ts
- src/analyzer/llm-learning-gate.ts
- src/analyzer/candidate-signals.ts
- src/controller/intervention-controller.ts
- src/controller/candidate-retriever.ts
- src/types/domain.ts
- src/store/sqlite/schema.sql

然后先输出改造计划，不要直接改代码。
计划中必须说明：
- 会改哪些文件
- 不会改哪些文件
- 哪些行为必须保持不变
- 哪些测试需要新增或更新
- 如何保证不会改变现有 host adapter 行为
- 如何保证新概念不是多余状态源

改造原则：
- core 只放主路径逻辑
- adapters 只做 host 适配
- operator 功能不进入主路径
- experimental 功能不能污染 runtime 主流程
- candidate 不等于 node
- record 不等于 learn
- retrieve 不等于 inject
- inject 不等于 helped
- Quality Band 初期是派生解释，不是新的持久状态源
- 成功任务只有在有可验证项目执行约束时才允许进入 candidate
```

---

## 8. 最小验收清单

### 产品层验收

```text
用户能一句话理解：
ExperienceEngine 让 coding agent 少重复走已经证明错误的项目路径。

用户能理解：
- 为什么这次注入
- 为什么这次没注入
- 这条经验来自哪里
- 这条经验帮过几次、害过几次
- 这条经验是否还应该继续影响任务
```

### 架构层验收

```text
主路径清楚：
lookup -> record -> finalize -> learn -> inject -> feedback

核心对象清楚：
Task Record
Learning Candidate
Experience Node
Injection Event
Attribution Record

边界清楚：
Adapter 不做业务判断
Runtime 不做所有事情
Learning Gate 控制准入
Governance 控制上线
Operator 功能不污染主路径
```

### 技术层验收

```text
所有测试通过
新增 learning gate 测试
新增 injection snapshot 测试
新增 no-injection explanation 测试
Runtime service 文件明显变薄
Core 服务职责清晰
```

---

## 9. 最终目标状态

优化完成后的 EE 应该给人这种感觉：

```text
清晰：
  一眼能看懂主路径。

克制：
  不什么都学，不什么都注入。

可靠：
  每条经验都有来源、证据、状态和反馈。

可治理：
  有用的经验增强，有害的经验降温或退役。

高效：
  当前任务不等待完整学习流水线。
  注入内容很短，不污染 prompt。

优雅：
  核心概念少，但表达力强。
```

最终架构口号：

```text
Memory does addition.
ExperienceEngine does governance.
```

但在产品表达上，可以更直接：

```text
ExperienceEngine turns real project execution history into governed, reusable coding guidance.
```

中文表达：

```text
ExperienceEngine 把真实项目执行历史，提炼成可治理、可复用、可验证的 coding guidance。
```

---

## 10. 优先级总结

最高优先级：

```text
1. 强化 Learning Gate
2. 拆分 Runtime Service
3. 收紧注入策略
4. 增强 no-injection explanation
```

中优先级：

```text
1. Quality Band
2. Candidate / Node 分层
3. Operator / Experimental 分层
4. Repo summary 指标
```

低优先级：

```text
1. 更多 host 支持
2. 更复杂 hybrid review
3. advanced export drafts
4. brokered long-tail actions 扩展
```

不要优先做：

```text
不要继续扩大 MCP 工具面
不要继续增加新记忆类型
不要追求通用 RAG
不要把所有 task 都学习成 candidate
不要让 hybrid 成为主路径依赖
```

---

## 11. 一句话行动建议

下一步不要继续加功能。

先做这件事：

```text
把 EE 的核心闭环打磨到：
一次真实任务结束后，
系统能准确判断“是否值得学”，
生成一条短而准的项目经验，
并在下一次相似任务中只注入一句真正有用的 guidance。
```

只要这个闭环稳定，ExperienceEngine 就已经具备清晰、优雅、长期不过时的架构基础。
