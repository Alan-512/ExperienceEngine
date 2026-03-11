# ExperienceEngine v2 OpenClaw 集成规范（OpenClaw Integration Spec）

## 1. 文档目标

本文档用于把 ExperienceEngine v2 与 OpenClaw 的集成边界、输入来源、Hook 接入方式、字段依赖和回退策略定义清楚。

这份文档的目的不是描述产品逻辑，而是回答：

> **在 OpenClaw 中，ExperienceEngine 具体接什么、读什么、写什么、依赖什么、不接什么。**

这是一份面向实施的宿主集成规范。

---

## 2. 集成定位

## 2.1 集成层级

ExperienceEngine 在 OpenClaw 生态中的层级应定义为：

- 不占用 memory slot
- 不替代 active ContextEngine
- 不接管主 context assembly 流程
- 作为普通 plugin 接入 agent loop / plugin API
- 通过 agent lifecycle hook、tool persistence hook 与可用上下文摘要信号，构建自己的 experience control layer

### 当前实现形态声明（2026-03 兼容口径）

基于 OpenClaw 当前公开能力，ExperienceEngine MVP 明确不实现 `kind: "context-engine"` 插件，而是采用：

- 普通 OpenClaw plugin
- 在 `register(api)` 中绑定运行时生命周期回调
- 可选结合 internal hooks 做审计、诊断或离线治理

原因：

- 该项目要验证的是 experience intervention policy，而不是主 context assembly
- 过早占用 ContextEngine slot 会抬高实现复杂度，并模糊产品边界
- 当前阶段应优先验证 sidecar / companion layer 是否独立产生净收益

## 2.2 依赖关系

ExperienceEngine 依赖的宿主能力包括：

### 必须依赖
- 当前任务输入 / prompt build 阶段摘要
- 工具调用结果持久化事件
- 当前 session / scope 上下文

### 可选依赖
- ContextEngine 提供的 context summary
- compaction 后的历史摘要片段
- 子代理结束回传的摘要信息
- 任务完成时的明确结果事件（若宿主提供）
- 会话结束 / agent 错误事件（若宿主后续公开稳定支持）

### 重要修订：不要把下列输入写成宿主硬保证

MVP 阶段不要假设 OpenClaw 一定公开提供以下稳定字段：

- 标准化 `task_outcome_signal`
- 完整 task trace 对象
- 明确的 `session:end`
- 明确的 `agent:error`

因此 ExperienceEngine 中的：

- `outcome_signal`
- “本轮任务是否结束”
- “是否发生 harm”

都应视为 ExperienceEngine 自己基于可见证据推断出的运行时字段，而不是宿主硬返回字段。

## 2.3 不直接依赖

ExperienceEngine 当前阶段不应直接依赖：

- ContextEngine 内部 DAG 实现细节
- memory plugin 内部私有存储结构
- recall 工具内部索引结构
- 某个特定 ContextEngine 插件的私有数据库 schema

原因：

- 保持 ExperienceEngine 作为 companion layer 的独立性
- 降低被单一 ContextEngine 实现绑死的风险

---

## 3. 宿主对象与边界

## 3.1 Memory

Memory 的职责：

- 保存信息连续性
- 提供 agent-facing memory 工具

ExperienceEngine 对 Memory 的使用原则：

- 不替代 Memory
- 不直接接管 Memory slot
- 不要求修改 Memory 的内部实现
- 可以消费由宿主注入到上下文中的 memory 结果，但不以此为强依赖

## 3.2 ContextEngine

ContextEngine 的职责：

- 摄取消息
- 组装 working context
- compaction
- 子代理上下文生命周期处理

ExperienceEngine 对 ContextEngine 的使用原则：

- 默认假设 ContextEngine 存在，但不要求一定是某个具体实现
- 如果宿主能提供 context summary，则消费；不能提供也要能退化运行
- 不重做 compaction 和 assembly 主流程

## 3.3 ExperienceEngine

ExperienceEngine 的职责：

- 适配宿主输入
- 提炼 ExperienceNode
- 决定是否介入
- 记录 InjectionEvent
- 更新 helped/harmed/state

---

## 4. 当前推荐接入点

基于 OpenClaw 当前插件能力，ExperienceEngine MVP 应区分两类接入点：

1. plugin lifecycle / agent loop callbacks
2. internal hooks（仅用于辅助审计、诊断、治理）

下文中 `before_prompt_build`、`tool_result_persist` 属于第一类；
`message:*`、`command:*` 等才属于 OpenClaw internal hooks 体系。

## 4.1 `before_prompt_build`

### 作用
用于：

- 获取当前任务输入摘要
- 识别当前 scope / task_type
- 判断是否进行经验介入
- 注入 compact hints 或展开 guidance

### 读取内容
建议读取：

- 当前用户输入 / 任务摘要
- session 信息
- 当前工作目录 / repo 信息（若可得）
- 宿主已组装好的部分上下文摘要（若可得）

### 输出内容
ExperienceEngine 在该阶段可以输出：

- `skip`
- `inject_conservative`
- `inject`
- 注入后的 compact hints block

### 责任边界
该生命周期回调中不要做：

- 重型 LLM 总结
- 长时间数据库扫描
- 主上下文重组

应只做：

- 轻量判断
- 候选检索
- 注入渲染

---

## 4.2 `tool_result_persist`

### 作用
用于：

- 收集工具调用成功/失败信号
- 收集 exit code / error signature / output summary
- 为 Analyzer 和 FeedbackManager 提供最关键证据

### 读取内容
建议读取：

- tool name
- input summary
- output summary
- success/failure
- exit code
- error message / status code /关键异常摘要

### 输出内容
写入内部 `ExperienceInputRecord` 所需的中间事件或日志。

### 责任边界
不要在这个持久化回调中直接做完整经验提炼；
它更适合做证据采集和轻量标准化。

---

## 4.3 message/internal hook（任务结束辅助相关）

### 作用
用于：

- 辅助识别本轮任务是否可能结束
- 获取 Agent 最终输出摘要
- 捕捉用户后续是否继续围绕同一问题追问
- 辅助推断 outcome signal

### 读取内容
建议读取：

- Agent 最终消息
- 用户紧随其后的反馈消息（若可观察）
- 任务是否仍围绕同一 error_signature 延续

### 输出内容
用于：

- 完成 `ExperienceInputRecord`
- 触发 Analyzer
- 触发 FeedbackManager

### 重要说明

这里的 message hook 不应被理解为：

- 宿主一定提供“任务结束”事件
- 宿主一定提供结构化 final outcome

更准确的做法是：

- 用 message / tool persistence / session 侧可见信号做启发式 finalize
- 若没有足够证据，则保留 `outcome_signal = "unknown"`

---

## 4.4 可选：subagent 相关 hook

如果宿主允许观察子代理生命周期，可选地接入：

- subagent spawn 前摘要
- subagent 结束后摘要

### 用途
用于：

- 将子代理输出作为 context summary 的一部分
- 提升 ExperienceInput 的上下文完整性

### 重要说明
MVP 阶段此项为可选，不应成为硬依赖。

---

## 5. ExperienceEngine 所需输入字段定义

ExperienceEngine 实现应统一适配出以下输入对象：

```ts
type ExperienceInput = {
  scope_id: string
  task_type: TaskType | "unknown"
  task_summary: string
  tool_events: ToolEvent[]
  outcome_signal: "success" | "failure" | "unknown"
  context_summary?: string
  injected_node_ids: string[]
}
```

### 字段来源口径

- `scope_id`: 宿主上下文 + ExperienceEngine resolver
- `task_type`: ExperienceEngine 启发式分类
- `task_summary`: 宿主输入摘要，或 ExperienceEngine 从当前请求归纳
- `tool_events`: 宿主工具结果事件
- `outcome_signal`: ExperienceEngine 推断字段
- `context_summary`: 宿主可选提供
- `injected_node_ids`: ExperienceEngine 运行时记录

### 字段说明

#### `scope_id`
用于确定经验生效边界。

#### `task_type`
用于限制经验检索范围。

#### `task_summary`
用于匹配 trigger_pattern。

#### `tool_events`
用于提炼经验、判定帮助与 harm。

#### `outcome_signal`
用于支持 helped / harmed 更新。

#### `context_summary`
若可得，用于提升 trigger 判断质量。

#### `injected_node_ids`
用于事后回写和归因。

---

## 6. 输入字段优先级

为了保证 ExperienceEngine 在宿主信号不完整时也能运行，建议对输入字段分层。

### Level 1：MVP 硬依赖

- 当前请求文本 / task summary
- 工具结果事件
- scope/session 上下文

### Level 2：强烈建议但不可假定

- 上下文摘要
- 历史摘要片段
- 子代理摘要

### Level 3：仅在宿主明确支持时启用

- 明确 task completion event
- 明确 agent error event
- 明确 outcome / success 标志

## 7. 插件装载要求（新增）

ExperienceEngine 工程实现必须补齐以下 OpenClaw plugin 约束：

- 提供 `openclaw.plugin.json`
- 声明稳定 `id`、`name`、`version`
- 提供插件入口，并以 `register(api)` 暴露能力
- 若暴露配置项，提供 `configSchema`
- 若需要在 Control UI 中配置，补 `uiHints`

MVP 阶段不声明 `kind: "context-engine"`。

## 8. 存储与依赖约束（新增）

由于 OpenClaw 插件安装与发布链路对依赖树更偏向 pure JS/TS，ExperienceEngine 在 MVP 阶段应遵循：

- SQLite 优先选择无需额外 postinstall/native build 的方案
- 向量索引依赖若包含原生构建步骤，必须先做单独兼容验证
- LanceDB 不应在未验证安装链路前被写成唯一必选依赖

更准确的表述应为：

- SQLite：必选主元数据存储
- JSONL：必选运行日志
- 向量索引：可选增强层，先以可替换接口封装

## 6.1 必须字段

没有这些字段，ExperienceEngine 无法工作：

- `scope_id`
- `task_summary`
- `outcome_signal`
- `injected_node_ids`

## 6.2 强烈建议字段

没有这些字段，体验会大打折扣：

- `task_type`
- `tool_events`

## 6.3 可选增强字段

没有这些字段，ExperienceEngine 仍可退化运行：

- `context_summary`
- 子代理摘要
- compaction 历史摘要片段

---

## 7. 回退策略（Fallback）

宿主真实环境中，某些信号可能拿不到或不稳定，因此必须设计回退逻辑。

## 7.1 若 `task_type` 无法可靠解析

- 设为 `unknown`
- 跳过经验提炼与经验介入
- 只保留基础日志

## 7.2 若 `context_summary` 不可用

- 仅用 `task_summary + tool_events + scope stats` 做介入判断
- 不阻塞 ExperienceEngine 运行

## 7.3 若 `tool_events` 不完整

- outcome signal 仍可驱动部分 feedback
- 但应降低 ExperienceNode 入库概率

## 7.4 若用户反馈不可见

- 不依赖显式用户纠偏做强判断
- 只用工具结果与后续相同错误是否重复出现做弱归因

---

## 8. OpenClaw 集成中的职责分工

为避免实现漂移，必须把三层职责写死。

## 8.1 宿主 / OpenClaw
负责：

- 提供 hook 生命周期
- 提供 session / task / tool 基础事件
- 提供 contextEngine / memory slot 机制

## 8.2 ContextEngine
负责：

- 历史摄取
- 压缩
- working context 组装
- 历史可回钻能力

## 8.3 ExperienceEngine
负责：

- 适配 ExperienceInput
- 提炼 ExperienceNode
- 进行 intervention gating
- 记录 InjectionEvent
- 更新 helped/harmed/state

---

## 9. 推荐的集成数据流

建议的主流程如下：

### 任务开始前
1. `before_prompt_build`
2. InputAdapter 构造当前 `ExperienceInput` 的前半部分
3. InterventionController 输出 `skip / inject_conservative / inject`
4. 若非 skip，则注入 compact hints block
5. 记录 `InjectionEvent` 初始信息

### 任务执行中
1. `tool_result_persist` 持续采集工具结果
2. 累积 `tool_events`
3. 标准化错误签名与结果摘要

### 任务结束后
1. message hook / 结果收口
2. 完成 `ExperienceInputRecord`
3. Analyzer 提炼 ExperienceNode
4. FeedbackManager 更新 usage/helped/harmed/state
5. 更新 `ScopeTaskStats`

---

## 10. 性能与资源约束

ExperienceEngine 在宿主集成中必须遵守以下限制：

## 10.1 `before_prompt_build` 必须轻量

- 不做重型长文本分析
- 不做大规模数据库扫描
- 不做深度多轮模型调用

## 10.2 Analyzer 与 Feedback 应偏后处理

耗时稍重的动作应放在：

- 任务结束后
- 后续分析阶段

而不是放在 prompt build 的关键路径里。

## 10.3 注入必须受 token 预算约束

建议硬限制：

- 默认最多 1–3 条
- 默认最多展开 1 条 Actionable Form

---

## 11. 日志与可观测性要求

OpenClaw 集成实现必须从第一天就保留以下日志：

- `input_adapter_events.jsonl`
- `injection_events.jsonl`
- `analyzer_events.jsonl`
- `feedback_events.jsonl`
- `errors.jsonl`

每条日志至少应包含：

- timestamp
- scope_id
- task_type
- phase
- key payload summary

这样 coding agent 和后续调试才能定位问题。

---

## 12. MVP 阶段明确不做的宿主耦合

为了避免过早绑死某个插件实现，MVP 阶段不要：

- 直接读取某个 ContextEngine 私有 SQLite 表
- 依赖某个 ContextEngine 私有 DAG node 结构
- 依赖某个 memory plugin 的私有 API
- 把 ExperienceEngine 写成必须替换 active ContextEngine 才能运行

这样后续才更容易演化为真正的 companion layer。

---

## 13. coding agent 实施要求

coding agent 在实现 OpenClaw 集成时，应严格遵守：

1. **先做 InputAdapter，不要先写 Analyzer**
2. **先确保可以拿到稳定 ExperienceInput，再做控制逻辑**
3. **Context summary 必须是可选依赖**
4. **不要越过宿主边界去重造 ContextEngine 功能**
5. **所有 Hook 接入都必须保留 fallback 行为**

---

## 14. 最终结论

OpenClaw 集成规范的核心不是“尽可能多拿宿主内部信息”，而是：

> **在不破坏宿主分层的前提下，稳定拿到足够支撑 ExperienceEngine 运行的最小输入集合。**

这决定了 ExperienceEngine 能不能作为一个真正独立、可持续演化的 experience control layer 存在。
