# ExperienceEngine v2 经验表示规范（Experience Representation Spec）

## 1. 文档目标

本文档用于补齐 ExperienceEngine v2 文档体系中最关键但尚未完整定义的一层：

> **经验到底记什么、以什么结构保存、如何让 Agent 在使用时不仅“看见提示”，而且“知道怎么做”。**

此前的 v2 文档已经较完整地定义了：

- ExperienceEngine 的产品定位
- ExperienceController 的介入逻辑
- ExperienceNode 的生命周期与反馈回写
- MVP 的实施与实验方案

但仍缺少一个关键部分：

> **ExperienceNode 的内容结构，如何从“可检索提示”升级为“可执行 guidance 单元”。**

本文档就是为了解决这个问题。

---

## 2. 核心判断

## 2.1 当前 ExperienceNode 设计的局限

v2 文档中的 ExperienceNode 已经足够支撑：

- 经验筛选
- 检索排序
- 介入控制
- helped/harmed 回写
- cooling / retired 生命周期

但如果目标是：

> 让 Agent 在未来命中某条经验时，能够像读取一个轻量 Skill 一样，快速知道该如何处理问题

那么现有结构还不够。

原因是：

- `compact_hint` 更像提醒，而不是动作说明
- `trigger_pattern` 只能描述“何时相关”，不能描述“如何做”
- 当前节点结构缺少动作顺序、禁忌动作、停止条件、回退路径等执行信息

因此，ExperienceEngine 需要把经验表示从：

> **Hint-only representation**

升级为：

> **Hint + Actionable Guidance representation**

---

## 3. ExperienceEngine 要记什么经验

ExperienceEngine 不应该记录所有“有用信息”，而只应记录：

> **那些在未来相似任务中，能够直接影响执行路径的经验。**

这些经验必须满足：

- 与任务执行强相关
- 可验证
- 可复用
- 可压缩为短提示
- 在必要时可展开为可执行 guidance

---

## 4. 经验内容的四大类

MVP 及 v1 阶段，ExperienceEngine 建议只记录以下四类经验。

## 4.1 高价值排障顺序

定义：

> 对某类任务，存在一个明显比默认方式更优的排查顺序。

示例：

- 在这个 repo 中，build error 先检查 codegen/types，再检查 downstream 文件报错
- 这类测试失败先区分 fixture/data 问题，再排查业务逻辑

这类经验对 Agent 最有帮助，因为它直接改变“先做什么、后做什么”。

---

## 4.2 高价值前置条件

定义：

> 某些操作在执行前，必须先满足特定前提，否则容易造成假性错误或误导。

示例：

- 修改 schema 后，通常必须先重新生成 types/client
- 切换配置后，需要先重建缓存/重新 build，再看业务错误

这类经验本质上是“前置动作提示”。

---

## 4.3 高频误导路径

定义：

> 某类任务中，Agent 常见的一条直觉路径经常是错的，应该被显式提醒避免。

示例：

- 遇到 429 时，不要先怀疑参数错，先查限流配额
- 这类报错不要先改业务代码，通常是环境或生成物未同步

这类经验适合以 `warning` 形式保存。

---

## 4.4 局部 scope 内稳定有效的小流程

定义：

> 在某个 repo/workspace 内，对一类问题已经形成稳定有效的局部操作 recipe。

示例：

- 在这个项目中，修复 API schema 相关错误通常按：schema → codegen → client → tests 的顺序处理
- 这个测试套件失败时，通常按：fixture → env var → snapshot → logic 的顺序检查

这类经验最接近轻量 Skill，是未来高价值节点的重要来源。

---

## 5. 不应该记录什么经验

ExperienceEngine 应明确拒绝以下类型内容进入 ExperienceNode：

## 5.1 一次性事实

例如：

- 某个临时路径名
- 某次偶发网络错误
- 一次性版本信息

这类信息可能属于 memory/context，不属于 experience control 资产。

## 5.2 普通知识

例如：

- HTTP 429 表示请求过多
- TypeScript 编译会检查类型

这类内容不是执行经验，而是一般知识。

## 5.3 纯结果、没有过程的结论句

例如：

- “最后成功了”
- “问题在 schema”

如果无法表达为未来可执行 guidance，就不应入库。

## 5.4 过于抽象的哲学性经验

例如：

- “要先系统思考”
- “多观察上下文”

这类内容太泛，无法指导具体动作。

## 5.5 过长且无法压缩的复杂案例

如果某条经验无法压缩成：

- 触发模式
- 一句短提示
- 一个短流程

那它不应进入 ExperienceNode，而应保留在宿主上下文资产中，由 ContextEngine 管理。

---

## 6. Experience 表示的两层结构

这是本文档最核心的设计。

ExperienceEngine 不应让每条经验都只有一个 `compact_hint`，也不应直接把每条经验都做成沉重 Skill。

更合理的方式是：

> **每条经验同时拥有两种表示：Compact Form + Actionable Form**

---

## 7. Compact Form

## 7.1 作用

Compact Form 用于：

- 日常 runtime 注入
- token 成本最小化
- 快速提醒 Agent 当前最关键的动作方向

## 7.2 组成

Compact Form 至少包括：

- `trigger_pattern`
- `compact_hint`

## 7.3 示例

### 示例 1

- `trigger_pattern`: schema 变更后出现大量 client/type 错误
- `compact_hint`: 在这个项目里，先重新生成 client/types，再排查 downstream 报错。

### 示例 2

- `trigger_pattern`: API 返回 429
- `compact_hint`: 先检查限流/配额，不要先怀疑参数问题或盲目重试。

## 7.4 特点

Compact Form 必须满足：

- 1–2 句
- 清晰、具体
- 可执行
- 无需依赖长上下文才能理解

---

## 8. Actionable Form

## 8.1 作用

Actionable Form 用于：

- 在高置信场景中展开经验
- 让 Agent 不仅“被提醒”，而且“知道按什么步骤做”
- 让经验在必要时具备接近轻量 Skill 的指导能力

## 8.2 组成

Actionable Form 建议至少包括：

- `goal`
- `recommended_steps`
- `avoid_steps`
- `fallback_steps`
- `success_signal`
- `stop_condition`
- `escalation_condition`

## 8.3 示例

### 示例：schema 变更类经验

- `goal`: 修复 schema 变更导致的 client/type 错误
- `recommended_steps`:
  1. 确认 schema 文件修改是否已保存
  2. 运行 codegen / types generation
  3. 检查 client/types 是否同步更新
  4. 再排查 downstream 报错是否仍存在
- `avoid_steps`:
  - 不要先直接改 downstream 业务文件
  - 不要在未重新生成 types 前处理表层类型错误
- `fallback_steps`:
  - 若生成后仍失败，检查 codegen 配置或 schema 引用路径
- `success_signal`: codegen 成功且 downstream 类型错误明显减少或消失
- `stop_condition`: codegen 已成功且主要错误消失
- `escalation_condition`: codegen 本身失败或生成物未更新

这个结构已经具备“迷你 skill”特征，但仍明显比完整 Skill 系统更轻。

---

## 9. ExperienceNode 新推荐结构

基于上面的两层表示，建议将 ExperienceNode 升级为：

```ts
type ExperienceNode = {
  id: string
  node_type: "strategy" | "warning"
  scope_id: string
  task_type: TaskType

  // 适用条件
  trigger_pattern: string
  applicability_notes?: string
  env_signature?: string

  // Compact Form
  compact_hint: string

  // Actionable Form
  goal?: string
  recommended_steps?: string[]
  avoid_steps?: string[]
  fallback_steps?: string[]
  success_signal: string
  stop_condition?: string
  escalation_condition?: string

  // 来源与证据
  evidence_summary: string
  source_kind: "system_derived" | "user_authored_candidate_promoted"

  // 生命周期与反馈
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

---

## 10. 新字段的含义

## 10.1 `goal`

表示：

> 这条经验试图帮助 Agent 达成什么局部目标。

作用：

- 帮助 Agent 理解为什么要执行这条经验
- 避免把经验误用到相似但不同目标的问题上

---

## 10.2 `recommended_steps`

表示：

> 最推荐的执行顺序或局部操作流程。

这是使经验真正“像 skill”一样有用的核心字段。

Agent 未来不是只能看到一句提醒，而是可以在高置信场景下展开成一组动作。

---

## 10.3 `avoid_steps`

表示：

> 在这个问题模式下，应避免优先采取的动作。

这对 `warning` 节点尤其重要。

很多经验最有价值的部分，不是“该做什么”，而是：

> **不要先做什么。**

---

## 10.4 `fallback_steps`

表示：

> 首选路径无效时，应如何继续推进。

这个字段可以显著减少经验在失败后立刻失去价值的情况，让经验具备更强鲁棒性。

---

## 10.5 `success_signal`

表示：

> 这条经验奏效时，最应该观察到的结果信号。

作用：

- 让 Agent 知道何时停止继续执行该经验路径
- 让 ExperienceEngine 更容易做 helped/harmed 粗归因

---

## 10.6 `stop_condition`

表示：

> 达到什么状态就不应继续沿这条经验执行。

避免 Agent 在经验路径上“过度执行”。

---

## 10.7 `escalation_condition`

表示：

> 出现什么情况时，这条经验不再适合继续，应该切换到更高层排查。

这使经验不再只是静态建议，而具备条件性边界。

---

## 11. strategy 和 warning 的内容差异

虽然二者共享同一结构，但重点不同。

## 11.1 strategy 节点

更强调：

- `goal`
- `recommended_steps`
- `success_signal`
- `fallback_steps`

它的作用是：

> 告诉 Agent 应该优先如何做。

## 11.2 warning 节点

更强调：

- `trigger_pattern`
- `compact_hint`
- `avoid_steps`
- `escalation_condition`

它的作用是：

> 告诉 Agent 不要被哪种高频错误路径误导。

---

## 12. 从 trace 到 ExperienceNode 的提炼流程

Analyzer 不应只是把任务总结成一句话，而应分两步生成经验。

## 12.1 第一步：生成 Compact Form

目标：

- 找到这次任务最值得未来提醒的一句话
- 确定触发模式

输出：

- `trigger_pattern`
- `compact_hint`

## 12.2 第二步：补 Actionable Form

条件：

- 当经验明显具备可复用流程性时
- 或当该节点 support_count / helped_count 较高时

输出：

- `goal`
- `recommended_steps`
- `avoid_steps`
- `fallback_steps`
- `success_signal`
- `stop_condition`
- `escalation_condition`

这意味着：

- 不是所有节点一开始都必须完整 actionized
- 但高价值节点应逐步进化出更强 guidance 结构

---

## 13. 经验的“展开条件”

这是之前文档里缺失的一层。

ExperienceEngine 不应默认每次都把 Actionable Form 展开注入。

更合理的策略是：

## 13.1 默认只注入 Compact Form

适用于：

- 一般相似任务
- 风险中等的任务
- token 预算紧张场景

## 13.2 在高置信场景下展开 Actionable Form

建议只有在以下场景之一满足时，才注入展开版 guidance：

- 当前任务高度命中该节点 trigger pattern
- 当前节点 helped_ratio 显著高
- 当前 task_type 属于高风险高失败率类别
- 当前 compact hint 过去多次证明需要扩展说明才能真正起效

## 13.3 展开原则

展开后也要克制：

- 最多展开 1 条节点
- 最多展示 3–5 个步骤
- 避免长篇推理链注入

这样才能兼顾：

- guidance 精度
- token 预算
- Agent 注意力保护

---

## 14. 经验与 Skill 的关系

ExperienceEngine 不应直接等同于 Skill 系统，但高质量经验应该：

> **在必要时表现得像迷你 Skill。**

可以这样理解：

- Skill：通常是更稳定、更显式、更长期的操作说明书
- ExperienceNode：是轻量、动态、可退役的运行时经验单元

因此 ExperienceNode 不需要一开始就做成完整 Skill，但它至少要具备：

- 触发条件
- 动作顺序
- 禁忌动作
- 成功判据

只有这样，Agent 命中它时才会“知道该怎么做”，而不是只得到一个方向性提醒。

---

## 15. 经验质量的额外评估维度

在已有 helped/harmed 之外，建议对 ExperienceNode 的内容质量增加三个维度抽样检查：

## 15.1 Actionability（可执行性）

问题：

- 这条经验能不能让 Agent 立刻知道下一步动作？

## 15.2 Specificity（具体性）

问题：

- 它是否足够针对某个问题模式，而不是泛泛提醒？

## 15.3 Expandability（可展开性）

问题：

- 它是否值得被补全成 Actionable Form？

这三项是后续将高价值节点升级为“接近 Skill 的 guidance 单元”的基础。

---

## 16. MVP 与 v1 的推荐范围

## 16.1 MVP 阶段

MVP 不需要让所有节点都完整具备 Actionable Form。

建议：

- 所有节点必须有 Compact Form
- 只有最有价值的一小部分节点补 Actionable Form

这样既能验证方向，又不会让 Analyzer 过早复杂化。

## 16.2 v1 阶段

当某节点满足以下条件之一时，优先补全 Actionable Form：

- `support_count >= 2`
- `helped_count >= 2`
- 某类 task_type 中复用率高
- 用户通过 inspect / feedback 明确认为这条节点高价值

这时 ExperienceEngine 就开始从“经验提醒系统”向“经验 guidance 系统”演化。

---

## 17. 最终结论

ExperienceEngine 之前的文档，已经把“经验控制层”设计得比较完整了，但还没有把“经验内容表示层”设计完整。

真正要让 Agent 在未来命中某条经验时：

> **不仅知道“这条经验相关”，而且知道“接下来怎么做”**

ExperienceNode 就不能只停留在：

- `trigger_pattern`
- `compact_hint`

而必须升级为：

- Compact Form：用于日常轻注入
- Actionable Form：用于必要时展开成迷你 Skill

这就是 ExperienceEngine 在 ContextEngine 时代，继续保持轻量、动态、可退役，同时又具备精准指导能力的关键。

