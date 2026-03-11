# ExperienceEngine v2 数据结构与状态机规范（ContextEngine 时代重写版）

## 1. 文档目标

本文档用于在 ExperienceEngine 新定位下，重新定义 MVP 阶段的数据结构、核心实体关系、状态机规则与关键更新逻辑。

这里的数据模型不再围绕“上下文基础设施”展开，而是围绕：

> **经验节点、介入行为、反馈回写与经验退役**

展开。

换句话说，这份规范服务的是一个 **经验干预控制层**，而不是一个完整上下文引擎。

---

## 2. 新设计原则

## 2.1 数据模型只承载 Experience 层资产

MVP 阶段，ExperienceEngine 不负责建模：

- lossless 历史本体
- DAG 摘要树本体
- context assembly 结构
- recall 主工具数据

这些属于宿主 / ContextEngine 层。

ExperienceEngine 只建模：

- 经验节点
- 介入记录
- 局部风险统计
- 用户经验候选

## 2.2 结构化经验优先于大文本历史

ExperienceEngine 的核心资产不是 transcript，而是：

- `strategy`
- `warning`
- 介入效果统计
- 生命周期状态

因此模型必须确保：

- 节点短小、可检索、可注入
- 生命周期可解释
- 反馈回写可计算

## 2.3 模型要可演化，但不过度超前设计

v0 / MVP 不引入：

- 抽象 pattern 图谱
- 复杂 linked memory network
- contrast graph 主模型
- skill 自动升格主模型

这些留给后续阶段。

---

## 3. 核心实体概览

在新定位下，MVP 阶段定义以下核心实体：

1. `Scope`
2. `ExperienceInputRecord`
3. `ExperienceNode`
4. `InjectionEvent`
5. `ScopeTaskStats`
6. `UserAuthoredCandidate`

注意：

- `TaskTrace` 在新体系里不再被强调为一等产品资产
- 它更像 InputAdapter 层消费到的宿主输入记录
- 因此这里将其降级为 `ExperienceInputRecord`

---

## 4. Scope 模型

## 4.1 作用

`Scope` 仍然表示经验生效的最小边界。

MVP 中继续采用：

> `repo / workspace`

作为主作用域单位。

## 4.2 定义

```ts
type Scope = {
  scope_id: string
  scope_type: "workspace" | "repo"
  scope_name: string
  root_path?: string
  is_disabled: boolean
  created_at: string
  updated_at: string
}
```

## 4.3 说明

- `Scope` 不代表上下文存储边界，只代表经验介入控制边界
- `is_disabled` 仅控制 ExperienceEngine 是否在该范围内介入

---

## 5. TaskType 枚举

MVP 保持不变：

```ts
type TaskType =
  | "bug_fix"
  | "build_debug"
  | "test_debug"
  | "integration_fix"
```

运行态仍允许：

```ts
type ResolvedTaskType = TaskType | "unknown"
```

`unknown` 不参与经验提炼和介入。

---

## 6. ExperienceInputRecord 模型

## 6.1 作用

`ExperienceInputRecord` 表示一次被 ExperienceEngine 消费过的宿主输入记录。

它不是宿主全量上下文，也不是长期记忆对象，而是：

> **ExperienceEngine 提炼经验、记录介入结果时所依赖的最小输入快照**

## 6.2 定义

```ts
type ExperienceInputRecord = {
  record_id: string
  scope_id: string
  session_id: string
  task_type: ResolvedTaskType
  task_summary: string
  outcome_signal: "success" | "failure" | "unknown"
  context_summary?: string
  evidence: string[]
  injected_node_ids: string[]
  created_at: string
}
```

## 6.3 说明

- `context_summary` 是宿主可选提供的摘要，不是 ExperienceEngine 自己生成的上下文树
- `evidence` 用于支持经验提炼和反馈归因
- `injected_node_ids` 用于后续回写 helped / harmed

---

## 7. ExperienceNode 模型

## 7.1 作用

`ExperienceNode` 仍然是 ExperienceEngine 的核心资产，但在新定位下，它的定义要更明确：

> **一条可以被控制层选择性介入当前任务的经验节点**

而不是“记忆块”或“通用知识单元”。

## 7.2 节点类型

MVP 仅支持两类：

- `strategy`
- `warning`

## 7.3 定义

```ts
type ExperienceNode = {
  id: string
  node_type: "strategy" | "warning"
  scope_id: string
  task_type: TaskType
  trigger_pattern: string
  compact_hint: string
  evidence_summary: string
  success_signal: string
  env_signature?: string
  source_kind: "system_derived" | "user_authored_candidate_promoted"
  state: "candidate" | "active" | "cooling" | "retired"
  usage_count: number
  helped_count: number
  harmed_count: number
  support_count: number
  last_used_at?: string
  last_helped_at?: string
  last_harmed_at?: string
  created_at: string
  updated_at: string
}
```

## 7.4 字段解释（新口径）

### `trigger_pattern`
表示：

> 这条经验在什么任务模式下值得被控制层考虑介入。

### `compact_hint`
表示：

> 真正注入到当前任务中的经验提示文本。

必须满足：

- 1–2 句
- 清晰、短小、可执行
- 不依赖长篇上下文才能理解

### `state`
不再被理解为“记忆生命周期”，而应被理解为：

> **经验是否仍适合介入当前任务的控制状态。**

### `support_count`
表示：

> 有多少独立输入记录支持这条经验的存在。

---

## 8. UserAuthoredCandidate 模型

## 8.1 作用

用户通过 `remember` 提供的内容，在新定位下更应该被理解为：

> **用户提出的经验候选，而不是直接可注入的记忆块。**

## 8.2 定义

```ts
type UserAuthoredCandidate = {
  id: string
  scope_id: string
  raw_text: string
  normalized_hint: string
  suggested_task_type?: TaskType
  state: "candidate" | "promoted" | "rejected"
  created_at: string
  updated_at: string
}
```

## 8.3 规则

- 默认进入 `candidate`
- 必须在真实任务中被验证后，才允许转化为 `ExperienceNode`
- 不直接进入高优先介入池

---

## 9. InjectionEvent 模型

## 9.1 作用

`InjectionEvent` 在新体系中的战略地位更高。

它不只是“注入日志”，而是：

> **一次经验介入控制行为及其事后观察结果。**

## 9.2 定义

```ts
type InjectionEvent = {
  injection_id: string
  record_id: string
  scope_id: string
  task_type: TaskType
  mode: "inject" | "inject_conservative"
  injected_node_ids: string[]
  injection_count: number
  was_successful: boolean | null
  harm_observed: boolean | null
  created_at: string
  resolved_at?: string
}
```

## 9.3 字段解释

### `mode`
表明这是哪种控制行为：

- `inject`
- `inject_conservative`

### `was_successful`
用于判断介入后任务是否成功。

### `harm_observed`
用于判断此次介入是否出现明显副作用。

---

## 10. ScopeTaskStats 模型

## 10.1 作用

`ScopeTaskStats` 在新定位下应被理解为：

> **局部风险信号与局部介入效果信号的聚合对象。**

它不是单纯统计表，而是 InterventionController 的输入之一。

## 10.2 定义

```ts
type ScopeTaskStats = {
  scope_id: string
  task_type: TaskType
  total_tasks: number
  success_tasks: number
  failed_tasks: number
  unknown_tasks: number
  injected_tasks: number
  injected_success_tasks: number
  updated_at: string
}
```

## 10.3 用途

用于判断：

- 当前 `scope + task_type` 是否高风险
- 当前 task_type 是否已有介入价值趋势
- 是否值得进入候选节点检索

---

## 11. 实体关系（重写版）

在新定位下，核心关系应理解为：

- 一个 `Scope` 包含多个 `ExperienceInputRecord`
- 一个 `ExperienceInputRecord` 可能产生零到多条 `ExperienceNode`
- 一个 `ExperienceInputRecord` 可能对应一个 `InjectionEvent`
- 一个 `InjectionEvent` 关联多个 `ExperienceNode`
- 一个 `Scope + TaskType` 维护一条 `ScopeTaskStats`
- 一个 `UserAuthoredCandidate` 被验证后可转化为 `ExperienceNode`

这里不再强调完整 task trace 层级关系作为产品主叙事。

---

## 12. ExperienceNode 生命周期状态机（新口径）

MVP 依然保留四状态：

- `candidate`
- `active`
- `cooling`
- `retired`

但现在必须明确：

> 这不是经验是否被“记住”的状态机，而是经验是否继续具备“介入当前任务”的资格状态机。

### 12.1 candidate

表示：

- 节点刚被提炼出来
- 有初步价值，但还不够证明它应被稳定介入

#### 进入条件
- 新生成节点
- 用户候选被初次接受

#### 退出条件
- 积累足够支持后进入 `active`
- 被证明长期无价值进入 `retired`

### 12.2 active

表示：

- 节点可以正常参与介入候选排序
- 当前仍然具备介入价值

#### 进入条件
- candidate 被验证通过
- cooling 后重新恢复

#### 退出条件
- 近期收益下降 → `cooling`
- 长期无效或明显 harm → `retired`

### 12.3 cooling

表示：

- 节点仍可能有局部价值
- 但不再是优先介入项

#### 进入条件示例
- 连续 3 次介入无明显收益
- 最近 5 次中帮助率明显下降

#### 退出条件
- 再次出现帮助 → `active`
- 持续低收益或 harm → `retired`

### 12.4 retired

表示：

- 节点不再参与介入控制
- 仅保留审计与人工 inspect 价值

#### 进入条件示例
- 连续 5 次介入无收益
- 或累计 2 次明确 harm
- 或人工强制停用

---

## 13. UserAuthoredCandidate 生命周期

保持三状态：

- `candidate`
- `promoted`
- `rejected`

## 13.1 新解释

这里的 `promoted` 表示：

> 候选经验已经获得足够真实任务支持，正式变成可参与介入控制的 ExperienceNode。

---

## 14. 介入决策状态（保留并上升重要性）

虽然 MVP 不一定单独建表，但内部决策必须显式保留：

- `skip`
- `inject_conservative`
- `inject`

## 14.1 新解释

这三个状态不是“检索结果”，而是：

> **控制层对当前任务做出的经验介入策略决定。**

### skip
不进行经验介入。

### inject_conservative
保守介入：
- 仅 1 条
- 优先高帮助率 warning / strategy

### inject
正常介入：
- 1–3 条
- 仍需保持紧凑

---

## 15. 关键计数更新逻辑（重写版）

## 15.1 新输入记录到来时

对 `ScopeTaskStats`：

- `total_tasks += 1`
- 按 outcome 更新 success / failed / unknown

## 15.2 若发生介入

- `injected_tasks += 1`
- 若任务成功，`injected_success_tasks += 1`

## 15.3 新节点创建时

- `usage_count = 0`
- `helped_count = 0`
- `harmed_count = 0`
- `support_count = 1`
- `state = candidate`

## 15.4 命中重复节点时

- `support_count += 1`
- `updated_at = now`

## 15.5 介入后回写节点

每个被介入节点：

- `usage_count += 1`
- `last_used_at = now`

若成功且经验有正向关联：

- `helped_count += 1`
- `last_helped_at = now`

若观察到明显误导：

- `harmed_count += 1`
- `last_harmed_at = now`

---

## 16. Harm 启发式（新定位下）

在新体系中，harm 的定义更贴近“错误介入”，而不是“记忆错误”。

推荐观察以下迹象：

- 介入提示与当前 scope/task 明显不匹配
- 介入后 Agent 立即走向已知低效路径
- 用户明确指出提示不适用或造成误导
- 介入提示占用注意力但未改善处理路径

MVP 阶段仍应保守标记 harm。

---

## 17. 节点检索排序规则（重写版）

当控制层决定“值得考虑介入”后，候选排序应按以下顺序：

1. `state`：active > cooling > candidate
2. `scope_id` 精确命中
3. `task_type` 精确命中
4. trigger_pattern 与 task_summary / context_summary 相似度
5. helped_ratio
6. support_count
7. recency

`retired` 永不进入候选池。

---

## 18. 人工治理规则

## 18.1 Scope 级禁用

设置 `Scope.is_disabled = true` 后：

- ExperienceEngine 不再在该 scope 下介入
- 可选继续记录输入记录（用于分析）

## 18.2 节点级停用

将 `ExperienceNode.state = retired`

说明：

- 经验被停用，不代表上下文被删除
- 只是它不再具备介入资格

---

## 19. 未来扩展预留（保留但降级）

MVP 不启用，但可预留 metadata：

```ts
type NodeMetadata = {
  linked_node_ids?: string[]
  contrast_group_id?: string
  abstract_pattern?: string
  tool_signature?: string[]
  promotion_source?: string
}
```

这些字段不再用于支撑“完整经验图谱”叙事，而只是作为后续 policy layer 扩展位。

---

## 20. 最终建议

在新定位下，MVP 数据模型最重要的不是“像不像完整记忆系统”，而是保证三件事：

1. **ExperienceNode 真正能表示“值得介入的经验”**
2. **InjectionEvent 真正能表示“介入行为及其反馈结果”**
3. **状态机真的能让低价值经验逐渐退出控制层**

只要这三点成立，ExperienceEngine 就在 ContextEngine 时代拥有了稳定且清晰的数据底座。

