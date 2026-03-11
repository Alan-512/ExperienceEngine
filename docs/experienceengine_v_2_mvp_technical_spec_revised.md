# ExperienceEngine v2 MVP 技术方案（Revised）

## 1. 文档目标

本文档用于在新的产品定位下，重新定义 ExperienceEngine 的 MVP 技术方案。

这里的 MVP 不再试图验证“完整经验系统 + 上下文基础设施”的大闭环，而是只验证：

> **作为一个建立在 ContextEngine / task trace / tool results 之上的经验干预控制层，ExperienceEngine 是否能在真实 coding/debugging 任务中带来净收益。**

---

## 2. MVP 新原则

## 2.1 默认宿主已经有上下文基础设施

MVP 不再负责以下事情：

- 长会话 lossless 存储
- 主 compaction 流程
- 主 context assembly
- 主 recall 工具层
- 大文件上下文托管

这些能力应视为宿主或 ContextEngine 层能力。

## 2.2 只验证经验控制层

MVP 只验证以下四件事：

1. 能否从真实任务中提炼 strategy / warning
2. 能否判断当前任务是否需要这些经验介入
3. 能否记录经验介入后的帮助与干扰
4. 能否让低价值经验退出注入池

## 2.3 输入来源以“已有 trace / summary”为前提

MVP 假设可获得以下输入：

- 当前请求文本 / task summary
- tool result
- task outcome 相关可见证据
- 上下文摘要 / 历史摘要（如果宿主可提供）

ExperienceEngine 只消费这些输入，不重建底层上下文资产。

### 修订说明

这里不要把：

- 完整 task trace
- 明确 task outcome signal
- 明确 task end event

写成宿主硬保证。MVP 更准确的说法是：

- 有稳定工具结果事件
- 有当前任务输入
- 其余字段由 ExperienceEngine 在可见证据上做保守推断

## 2.4 注入必须保守

MVP 阶段依然坚持：

- 每次最多注入 1–3 条 hints
- 未满足触发条件则不注入
- 提示必须短且可执行

---

## 3. MVP 新范围

### 3.1 支持的宿主环境

MVP 仍然先绑定 OpenClaw，但定位已经变化：

- 利用 OpenClaw plugin lifecycle callbacks 获取 task summary / tool result
- 必要时结合 internal hooks 做审计与 finalize 辅助
- 尽可能消费已有 ContextEngine 提供的摘要信息
- 不接管整个 ContextEngine 生命周期

### 3.1.1 当前宿主兼容口径（新增）

MVP 当前明确选择：

- 普通 plugin
- sidecar / companion layer

MVP 当前明确不选择：

- ContextEngine slot plugin
- 主 context assembly extension

### 3.2 支持的任务类型

第一版仍只支持：

- `bug_fix`
- `build_debug`
- `test_debug`
- `integration_fix`

### 3.3 支持的经验节点类型

MVP 仍然只保留：

- `strategy`
- `warning`

---

## 4. 新的系统模块划分

在重定位后，MVP 模块应收缩为四层：

1. Input Adapter
2. Experience Analyzer
3. Intervention Controller
4. Outcome Feedback Manager

相比旧版，去掉了“大量上下文基础设施相关职责”。

---

## 5. 模块一：Input Adapter

## 5.1 目标

从宿主已有信号中提取 ExperienceEngine 需要的最小输入。

它不是新的上下文系统，只是适配层。

## 5.2 主要输入

### A. task trace
MVP 口径改为：
- 至少拿到工具结果流
- 若宿主能提供更完整 trace，则作为增强项使用

### B. tool results
包含：
- exit code
- API result code
- 构建结果 / 测试结果摘要

### C. task summary
包含：
- 当前任务的语义摘要
- 当前 task_type
- 当前 scope

注：

- `task_type` 与 `scope` 不必由宿主直接给出
- ExperienceEngine 可以自行 resolve

### D. optional context summary
如果宿主或 ContextEngine 可提供，则附加：
- compacted history summary
- 相关历史任务摘要
- 当前上下文装配中的关键摘要片段

## 5.3 输出对象

适配层输出统一的 `ExperienceInput`：

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

其中：

- `outcome_signal` 是 inferred field
- `task_type` 是 resolved field
- `injected_node_ids` 是 ExperienceEngine bookkeeping field

---

## 6. 模块二：Experience Analyzer

## 6.1 目标

基于 `ExperienceInput` 提炼可复用的经验节点。

## 6.2 Analyzer 的职责边界

Analyzer 只做：

- strategy / warning 提炼
- 入库门槛判断
- 重复节点合并

Analyzer 不做：

- 长历史摘要生成
- 上下文搜索主逻辑
- 对话级记忆组织

## 6.3 提炼逻辑

### success → strategy
从成功任务中提炼：

- 哪个操作顺序有效
- 哪个工具使用方式有效
- 哪个排障顺序有效

### failure → warning
从失败任务中提炼：

- 哪类动作常误导 Agent
- 哪种失败模式值得提前提醒
- 哪些惯性操作在该 scope 内低效或有副作用

## 6.4 入库门槛

只有同时满足以下条件才允许入库：

1. 可验证
2. 可复用
3. 具结构性

这里的“可验证”应优先依赖 tool result / outcome signal，而不是纯 LLM 自评。

---

## 7. 模块三：Intervention Controller

## 7.1 目标

判断当前任务是否值得被经验打断，以及应该如何介入。

## 7.2 这是 MVP 的真正核心

ExperienceEngine 在新定位下，最独特的模块就是这一层。

它回答两个问题：

1. `need_intervention?`
2. `which_experience_to_inject?`

## 7.3 触发条件

只有满足以下任一条件，才进入候选节点检索：

- 当前 `scope + task_type` 历史失败率较高
- 当前任务命中某类 warning pattern
- 当前任务与已知高帮助率 strategy 高度相似
- 当前上下文摘要中暴露出已知高风险模式

如果不满足，则直接 `skip`。

## 7.4 候选节点筛选

只从以下范围中检索：

- 同 `scope_id`
- 同 `task_type`
- `state in (active, cooling)`

## 7.5 排序逻辑

排序优先级建议为：

1. 节点状态
2. trigger_pattern 与 task_summary 相似度
3. helped_ratio
4. support_count
5. recency

## 7.6 注入格式

注入格式保持最简：

```text
Execution hints from prior similar tasks:
- ...
- ...
```

限制：

- 最多 1–3 条
- 每条 1–2 句
- 不注入大段解释
- 不注入完整历史摘要

## 7.7 注入模式

MVP 建议保留三种内部模式：

- `skip`
- `inject_conservative`
- `inject`

便于后续演化为 policy layer。

---

## 8. 模块四：Outcome Feedback Manager

## 8.1 目标

记录一次介入之后，经验节点究竟是：

- 帮到了任务
- 没有明显帮助
- 造成了误导或干扰

## 8.2 反馈更新逻辑

每次任务结束后，对被注入节点进行更新：

- `usage_count += 1`
- 若任务成功且经验相关，`helped_count += 1`
- 若观察到明显误导，`harmed_count += 1`

## 8.3 生命周期更新

MVP 仍采用：

- `candidate`
- `active`
- `cooling`
- `retired`

但在新定位下，这个状态机应更明确地被理解为：

> **经验可否继续介入任务的控制状态，而不是通用记忆生命周期。**

---

## 9. 数据模型（保留但重新解释）

核心数据对象保留原思路，但叙事变化：

### 9.1 ExperienceNode

不再被写成“经验知识块”，而应写成：

> **可被控制层选择性介入当前任务的经验节点**

### 9.2 InjectionEvent

不再只是“注入记录”，而是：

> **经验控制行为的反馈记录**

### 9.3 ScopeTaskStats

不再只是“任务统计”，而是：

> **判断是否需要经验介入的局部风险信号**

---

## 10. 冷启动设计（新定位下）

## 10.1 目标

在不拥有完整上下文系统控制权的前提下，避免早期误介入。

## 10.2 策略

- 前 10 次任务只提炼不注入
- 每个 `scope + task_type` 至少积累 2 条合格节点后才允许注入
- 若宿主有可靠 context summary，可将其仅用于 trigger 判断，不直接作为经验节点

## 10.3 /remember

保留用户手写经验候选，但它的定位也应改写为：

> **人为提供的经验候选，而不是直接进入上下文的记忆块。**

---

## 11. CLI 目标（保留但改写）

CLI 的主要目标不再是“查看经验库”，而是让用户理解：

- 系统最近介入了什么
- 哪些经验真的有帮助
- 哪些经验已经被停用

至少保留：

- `ee stats`
- `ee inspect <task_type>`
- `ee disable <task_type>`
- `ee disable --scope`
- `ee remember "<rule>"`

---

## 12. MVP 实施优先级（重写版）

新的优先级应调整为：

### 优先级 1：Input Adapter
原因：
MVP 现在依赖宿主输入，而不是自建基础设施。

### 优先级 2：Experience Analyzer
原因：
没有 strategy / warning，就没有控制层资产。

### 优先级 3：Intervention Controller
原因：
这是新产品定位的核心。

### 优先级 4：Outcome Feedback Manager
原因：
这是 ExperienceEngine 与普通检索型经验系统的关键区别。

### 优先级 5：CLI / 人工治理
原因：
用于观察、止损和调试。

---

## 13. MVP 成功标准（重写版）

MVP 成功不再要求“系统已经很完整”，而要求：

1. 能稳定消费宿主已有 task trace / summary / result 信号
2. 能持续生成可读、可复用的 strategy / warning 节点
3. 能在相似任务中保守地进行经验介入
4. 能基于结果反馈让一部分经验降权或退役
5. 至少在一个真实 scope 中观察到：
   - 首次成功率提升，或
   - 平均重试次数下降，或
   - 重复失败模式减少

如果满足这些条件，就说明 ExperienceEngine 这一层本身具有独立价值。

---

## 14. MVP 明确不做（重写版）

- 不做 ContextEngine 替代实现
- 不做主上下文压缩系统
- 不做 lossless context persistence
- 不做 DAG / graph 上下文基础设施
- 不做 recall 主工具集
- 不做长期会话存档系统
- 不做通用知识库
- 不做跨项目经验迁移
- 不做 team sync
- 不做 skill 自动进化

---

## 15. 最终结论

在新的产品定位下，ExperienceEngine MVP 不应再被理解为“一个不完整的小型上下文系统”，而应被理解为：

> **一个建立在宿主上下文能力之上的、专门负责经验介入判断与收益回写的控制层原型。**

这才是 ContextEngine 时代下，ExperienceEngine 最值得验证的核心命题。

## 配套文档与使用边界

本文件是 ExperienceEngine v2 的**MVP 技术主线文档**，负责说明：

- MVP 的目标
- 系统模块划分
- Input Adapter / Analyzer / Controller / FeedbackManager 的关系
- MVP 控制闭环如何成立

它**不是**最终版的数据字段字典、宿主 Hook 接线手册或完整编码手册。阅读与实施时，建议与以下文档配套使用：

- `ExperienceEngine v2 Master Overview And Doc Map`：整套文档导航与推荐阅读顺序
- `ExperienceEngine v2 Product Definition And Roadmap (Revised)`：产品定位、边界与路线
- `ExperienceEngine v2 OpenClaw Integration Spec`：宿主 Hook、输入字段、fallback 与集成边界
- `ExperienceEngine v2 Data Model And State Machine Spec`：核心数据模型与生命周期状态机
- `ExperienceEngine v2 Experience Representation Spec`：ExperienceNode 的 Compact Form / Actionable Form 结构
- `ExperienceEngine v2 Engineering Blueprint`：目录结构、接口、schema、伪代码与第一阶段编码顺序

如果需要进入实际开发，应以本文件说明技术主线，再结合上述文档完成具体实现。
