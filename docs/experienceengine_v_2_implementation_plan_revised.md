# ExperienceEngine v2 开发任务拆解 / Implementation Plan（Revised）

## 1. 文档目标

本文档用于在新的产品定位下，重新拆解 ExperienceEngine 的 MVP 开发计划。

旧版实施计划默认 ExperienceEngine 需要承担一部分上下文基础设施职责。新版计划则明确：

> **ExperienceEngine 的开发重点不再是“搭建上下文基础设施”，而是“围绕已有上下文输入构建经验介入控制闭环”。**

因此，新实施计划的目标是：

- 最快跑通经验控制闭环
- 避免重复建设 ContextEngine 已覆盖的能力
- 把工程资源集中到 ExperienceAnalyzer / InterventionController / FeedbackManager 上

---

## 2. 新实施原则

## 2.1 不重建宿主基础设施

默认宿主已经提供：

- 当前任务输入 / task summary
- tool results
- 上下文摘要（可选）

ExperienceEngine 只做消费和控制，不重建以下能力：

- 长会话存储
- 主 compaction
- 主 context assembly
- 主 recall 工具层
- 超长消息/大文件治理

补充：

- outcome signal 默认由 ExperienceEngine 推断
- 完整 task trace 不应被视为 Phase A 的硬前置

## 2.2 先验证“介入控制”，后优化“介入质量”

第一阶段重点不是把每个提示都做得很聪明，而是验证：

- 有没有必要存在一个独立的经验介入控制层
- 这层是否能产生净收益

## 2.3 先做“少而准”的控制器

ExperienceEngine 的成功不靠高注入率，而靠：

- 少量高价值节点
- 保守触发
- 可回写、可退役

因此工程实现必须围绕“保守”和“可解释”展开。

---

## 3. 新的开发阶段

建议将 v2 MVP 开发拆为 5 个阶段：

- Phase A：宿主输入适配层
- Phase B：经验提炼与节点入库
- Phase C：经验介入控制器
- Phase D：反馈回写与状态机
- Phase E：CLI、实验与迭代

相较旧版，明显弱化了“自建基础设施”的任务占比。

---

## 4. Phase A：宿主输入适配层

## 4.1 目标

把 OpenClaw / ContextEngine 侧已经存在的信号适配成 ExperienceEngine 可消费的统一输入对象。

## 4.2 任务清单

### A1. 定义 `ExperienceInput` 类型

统一承载：

- scope_id
- task_type
- task_summary
- tool_events
- outcome_signal
- context_summary（可选）
- injected_node_ids

### A2. 接入现有 hook

使用宿主现有 hook，收集：

- tool call result
- before_prompt_build 阶段任务摘要
- task 结束相关的可见证据

这里要明确区分：

- plugin lifecycle callbacks
- internal hooks

不要把它们混写成同一个 OpenClaw hook 系统。

### A3. 实现 `InputAdapter`

将多来源输入归并成单个 `ExperienceInput`。

### A4. 实现 `ScopeResolver`

确定当前任务作用域：

- repo/workspace
- 禁用状态

### A5. 实现 `TaskTypeResolver`

保持启发式分类：

- bug_fix
- build_debug
- test_debug
- integration_fix
- unknown

### A6. 接入可选 context summary

若 ContextEngine / 宿主可提供简要上下文摘要，则接入为可选字段，不强依赖。

### A7. 明确插件装载形态（新增）

补齐：

- `openclaw.plugin.json`
- plugin id / version / configSchema
- `register(api)` 入口
- 不声明 `kind: "context-engine"`

## 4.3 完成标准

Phase A 完成时，应满足：

- 能从宿主稳定构造 `ExperienceInput`
- 输入对象可用于后续 Analyzer / Controller
- unknown 任务可保守跳过
- 适配层日志可追踪

---

## 5. Phase B：经验提炼与节点入库

## 5.1 目标

从 `ExperienceInput` 中提炼 strategy / warning 节点，并持久化为经验资产。

## 5.2 任务清单

### B1. 实现 `ExperienceAnalyzer`

输入：`ExperienceInput`
输出：0～n 个节点候选

### B2. 实现 success → strategy 提炼

要求：

- 输出可执行、简短的经验提示
- 避免泛泛总结
- 附带 evidence summary

### B3. 实现 failure → warning 提炼

要求：

- 聚焦失败模式和误导路径
- 明确 warning 的适用场景

### B4. 实现入库门槛过滤器

检查：

- 可验证
- 可复用
- 具结构性

### B5. 实现节点去重 / 合并

按：

- scope
- task_type
- trigger_pattern 相似度
- compact_hint 相似度

合并节点，避免经验池膨胀。

### B6. 持久化 ExperienceNode

落到：

- SQLite（元数据、状态、计数）
- 可选向量索引（用于后续检索）

如果向量索引实现与 OpenClaw 插件安装链路不兼容，应允许 Phase B 先只落 SQLite + 文本检索。

## 5.3 完成标准

Phase B 完成时，应满足：

- 可以稳定从真实任务中产出 strategy / warning
- 节点不会无节制重复增长
- 节点可供后续介入控制器检索

---

## 6. Phase C：经验介入控制器

## 6.1 目标

实现 ExperienceEngine 最核心的新模块：

> 判断当前任务是否值得被经验打断，以及应该如何打断。

## 6.2 任务清单

### C1. 实现 `InterventionController`

控制器需明确输出：

- `skip`
- `inject_conservative`
- `inject`

### C2. 实现介入触发逻辑

候选条件：

- 当前 `scope + task_type` 历史失败率较高
- 当前任务命中 warning pattern
- 当前任务与高帮助率 strategy 高相似
- context summary 暴露高风险模式

### C3. 实现候选节点筛选

仅允许：

- 同 scope
- 同 task_type
- state ∈ {active, cooling}

### C4. 实现排序器

排序因子：

- state
- trigger match
- helped_ratio
- support_count
- recency

### C5. 实现注入裁剪器

强制：

- 最多 1–3 条
- 去重
- 多样性控制

### C6. 实现注入渲染器

生成统一 hints block。

### C7. 记录 `InjectionEvent`

每次介入都必须留下可回溯记录。

## 6.3 完成标准

Phase C 完成时，应满足：

- ExperienceEngine 能保守地决定何时介入
- 注入内容短小、可解释
- 不满足条件时完全不打断任务

---

## 7. Phase D：反馈回写与状态机

## 7.1 目标

让 ExperienceEngine 不只是“会注入”，而是会根据结果判断经验是否还值得保留。

## 7.2 任务清单

### D1. 实现 `FeedbackManager`

根据任务结束结果，更新被注入节点的：

- usage_count
- helped_count
- harmed_count

### D2. 实现 `ScopeTaskStats` 更新器

维护：

- 总任务数
- 成功/失败数
- 注入任务数
- 注入成功数

用于支持后续触发逻辑。

### D3. 实现状态机

保留四状态：

- candidate
- active
- cooling
- retired

### D4. 实现状态迁移规则

包括：

- 新节点进入 candidate
- candidate 经支持后进入 active
- active 连续低收益进入 cooling
- cooling 持续无收益或 harm 后进入 retired
- cooling 再次有效可回 active

### D5. 实现 harm 启发式

至少支持以下迹象：

- 注入内容明显不适用
- 注入后立即走向已知低效路径
- 用户显式否定某条提示

## 7.3 完成标准

Phase D 完成时，应满足：

- 节点会随真实使用效果发生生命周期变化
- 低价值经验可逐渐退出注入池
- 系统具备“不是越说越多，而是会闭嘴”的基础能力

---

## 8. Phase E：CLI、实验与迭代

## 8.1 目标

为开发和试验提供最小治理能力，并在真实 repo 中验证 ExperienceEngine 的价值。

## 8.2 任务清单

### E1. 实现 `ee stats`

展示：

- 最近任务数
- 注入次数
- 注入后成功数
- cooling / retired 节点数
- 最受益 task_type

### E2. 实现 `ee inspect <task_type>`

查看当前 scope 下：

- active nodes
- cooling nodes
- retired nodes

### E3. 实现 `ee disable <task_type>` / `ee disable --scope`

支持快速止损。

### E4. 实现 `ee remember "<rule>"`

写入用户经验候选。

### E5. 选择真实 repo 进行实验

要求：

- 高频 coding/debugging
- 工具结果明确
- 重复模式明显

### E6. 运行冷启动 + 保守注入实验

观察：

- 节点是否高质量
- 触发是否合理
- 是否有净收益趋势

## 8.3 完成标准

Phase E 完成时，应满足：

- 用户可查看和治理 ExperienceEngine 的介入行为
- 至少在一个真实 scope 中观察到正向趋势
- 能识别出哪些 task_type 最适合当前版本

---

## 9. 新的优先级排序

如果只能集中资源做最关键部分，优先级应为：

1. **InputAdapter**
2. **ExperienceAnalyzer**
3. **InterventionController**
4. **FeedbackManager**
5. **CLI + 实验**

原因非常明确：

- 没有 InputAdapter，就没有宿主输入
- 没有 Analyzer，就没有经验资产
- 没有 Controller，就没有独特产品价值
- 没有 Feedback，就没有与普通检索系统的差异

---

## 10. 新的最小上线标准

在新定位下，ExperienceEngine MVP 能被认为“可试用”，至少要满足：

1. 能稳定消费宿主已有 trace / result / summary 信号
2. 能持续产出 strategy / warning 节点
3. 能在相似任务中保守决定是否介入
4. 能根据结果回写帮助与干扰计数
5. 能让一部分低价值经验进入 cooling / retired
6. 用户能通过 CLI 查看和关闭 ExperienceEngine 的介入行为

---

## 11. 与旧版实施计划的最大差异

新的实施计划和旧版相比，有三个根本差异：

### 差异一：不再把上下文基础设施当作主要开发任务

旧版有大量精力默认花在 trace、history、context asset 本身上。

新版明确把这些降为“宿主输入来源”。

### 差异二：InterventionController 成为真正的中心模块

这意味着 ExperienceEngine 的独特价值终于从“经验库”转移到“经验控制”。

### 差异三：FeedbackManager 的战略地位上升

没有反馈回写，ExperienceEngine 很容易退化为“另一个会注入的经验检索器”。

有了反馈和退役，它才更像真正的 experience controller。

---

## 12. 最终建议

新的开发路线不该再问：

> “我们能不能自己做一套很强的上下文系统？”

而应该问：

> “在宿主已有强上下文系统之后，我们能不能证明：经验介入控制本身是值得独立存在的一层？”

如果这个问题能被 MVP 证明，ExperienceEngine 就在 ContextEngine 时代找到了自己真正的位置。

## 配套文档与使用边界

本文件是 ExperienceEngine v2 的**开发阶段拆解与顺序规划文档**，负责说明：

- Phase A / B / C / D / E 各做什么
- 模块间依赖关系
- 开发顺序怎么安排
- 每个阶段完成标准是什么

它**不是**具体代码目录结构、SQLite schema、TypeScript 类型定义或 Hook 伪代码的唯一说明。阅读与实施时，建议与以下文档配套使用：

- `ExperienceEngine v2 Master Overview And Doc Map`：整套文档导航与推荐阅读顺序
- `ExperienceEngine v2 Product Definition And Roadmap (Revised)`：产品定位、边界与路线
- `ExperienceEngine v2 MVP Technical Spec (Revised)`：MVP 技术主线与模块关系
- `ExperienceEngine v2 OpenClaw Integration Spec`：宿主集成细节与 fallback
- `ExperienceEngine v2 Experience Representation Spec`：ExperienceNode 内容结构与展开规则
- `ExperienceEngine v2 Engineering Blueprint`：工程目录、接口、schema、伪代码与第一阶段编码顺序

如果需要直接开始编码，应以本文件确定开发推进顺序，再以 `Engineering Blueprint` 作为具体实现蓝图。
