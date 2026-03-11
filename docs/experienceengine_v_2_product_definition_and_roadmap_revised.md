# ExperienceEngine v2 产品定义与路线图（Revised）

## 1. 文档目的

本文档用于在 OpenClaw 3.7 引入 ContextEngine 机制之后，重新定义 ExperienceEngine 的产品定位、目标边界、MVP 范围与后续路线图。

这是一份替代原始产品定义文档的新版本。

目标不是保留旧叙事，而是把 ExperienceEngine 明确收敛为：

> **建立在 ContextEngine / task trace / tool results 之上的经验干预控制层**

---

## 2. 新的一句话定义

**ExperienceEngine 是一个上下文感知的经验干预控制层（Context-aware Experience Controller）。**

它不负责成为主上下文引擎，而是负责：

- 从真实任务执行中提炼 strategy / warning 经验
- 判断这些经验是否值得介入当前任务
- 记录经验介入后的帮助与干扰
- 让低价值经验动态退出注入池

---

## 3. 它不是什么

ExperienceEngine 不是：

- 不是长上下文压缩引擎
- 不是 lossless context manager
- 不是主 context assembly 系统
- 不是历史 recall 主工具层
- 不是大文件上下文托管系统
- 不是 memory slot 替代品
- 不是完整 ContextEngine 的竞争实现

换句话说，它不再负责“保住上下文”这件事本身。

---

## 4. 它是什么

ExperienceEngine 的准确定位是：

> **运行时经验控制层（runtime experience control layer）**

ContextEngine 负责：

- 历史持久化
- 上下文压缩
- 上下文组装
- 子代理上下文继承
- 历史可回钻与搜索

ExperienceEngine 负责：

- 经验提炼
- 经验节点化
- 介入时机判断
- 介入效果回写
- 无效经验退役

因此二者是分层协作关系：

- **ContextEngine = 上下文基础设施层**
- **ExperienceEngine = 经验干预控制层**

---

## 5. 要解决的核心问题

在新的产品定义下，ExperienceEngine 解决的问题不再是“历史会不会丢”，而是：

> 即使宿主已经具备强上下文保留与召回能力，Agent 仍然缺少一个“经验是否应该介入当前任务”的控制层。

具体来说，它要解决四个问题：

### 5.1 经验筛选问题
并非所有历史都应该进入可注入经验池。

### 5.2 介入时机问题
并非所有相关经验都应该在当前任务中说出来。

### 5.3 收益评估问题
经验是否有用，不能只看“检索到了”，而要看“介入后是否有净收益”。

### 5.4 经验退役问题
若经验长期无效或有害，就必须退出注入池。

---

## 6. 核心价值主张

ExperienceEngine 对用户的价值，不再是“记得更多”，而是：

- 更少重复踩坑
- 更少无效重试
- 更少被无关提示打断
- 更高概率在真正需要时得到有帮助的提醒

它最核心的产品承诺可以写成：

> **不是让 Agent 听到更多过去，而是让 Agent 在真正需要时，听到更少但更有用的过去。**

---

## 7. 目标用户

ExperienceEngine 的目标用户没有根本变化，但表达方式要更精准。

### 核心用户
- 高频使用 coding agent 的个人开发者
- AI-native 独立开发者
- 在固定 repo / workspace 内长期迭代的人

### 用户前提
这些用户很可能已经：

- 拥有较强的上下文基础设施
- 使用 OpenClaw + ContextEngine / 类似上下文插件
- 有明确的 coding/debugging 高频任务
- 会反复遇到相似失败模式

ExperienceEngine 的价值不在于替代这些基础设施，而在于给这些用户再加上一层“经验是否介入”的控制能力。

---

## 8. 适用场景

ExperienceEngine 第一阶段依然只面向：

- `bug_fix`
- `build_debug`
- `test_debug`
- `integration_fix`

这类场景有共同特征：

- 工具调用密集
- 结果可验证
- 容易出现结构性重复失败
- 经验可被压缩为短提示

暂不重点支持：

- 开放式 research
- 长文写作
- 通用问答
- 纯创意任务

---

## 9. 新的产品形态

## 9.1 当前推荐形态

短期内，ExperienceEngine 最合理的产品形态是：

> **ContextEngine Companion Sidecar**

也就是：

- 自身不接管整个 ContextEngine 生命周期
- 默认依赖已有 task trace、tool result、上下文摘要等输入
- 通过 sidecar 形态验证“经验控制”这一层的独立价值

### 兼容性澄清（新增）

即使 OpenClaw 已支持更深层的 ContextEngine 插件化能力，ExperienceEngine v0 仍明确优先采用：

- 普通 plugin
- companion sidecar

而不是：

- 主 ContextEngine slot 实现
- context assembly 替代品

## 9.2 中期目标形态

当 ContextEngine 生态和 API 更稳定后，ExperienceEngine 可以逐步演化为：

> **Context-aware companion layer / experience policy layer**

其特征是：

- 更深度读取上下文装配信息
- 更精确控制经验注入位置和预算
- 更自然地与 compaction / assembly 协同

但这不是第一阶段必须完成的目标。

---

## 10. v0 / MVP 新定义

## 10.1 MVP 的唯一目标

> **验证“经验介入控制”本身是否具有可观测净收益。**

不是验证完整上下文系统，更不是验证 lossless context management。

## 10.2 MVP 一句话定义

> ExperienceEngine v0 是一个建立在已有 task trace 与上下文摘要之上的经验干预控制器。它在 repo/workspace + task_type 范围内提炼 strategy / warning，按需决定是否在后续相似任务中注入 1–3 条 compact hints，并根据实际结果对经验进行降权或退役。

## 10.3 MVP 的输入来源

MVP 默认依赖以下输入，而不是自行重建整套上下文基础设施：

- 当前任务输入 / task summary
- tool results
- task outcome 相关证据
- 可用的 context summary / compacted history（如果宿主提供）

说明：

- `task outcome signals` 在 MVP 中首先应被视为推断结果，而不是宿主保证字段
- `tool call traces` 若宿主公开可用则消费，否则降级为工具结果流

## 10.4 MVP 的最小价值闭环

1. 收集 trace
2. 提炼 strategy / warning
3. 决定是否注入 1–3 条 hints
4. 记录 usage/helped/harmed
5. 让无效经验进入 cooling / retired

## 10.5 MVP 明确不做

- 不做主 context assembly
- 不做主 compaction
- 不做 lossless context storage
- 不做 DAG 摘要树本体
- 不做主 recall 工具层
- 不做长期历史管理系统本体

---

## 11. 核心数据对象

在新的定位下，核心数据对象进一步聚焦。

### 11.1 ExperienceNode
表示一条可介入当前任务的经验。

MVP 只保留两类：

- `strategy`
- `warning`

### 11.2 InjectionEvent
表示一次经验介入行为及其事后观察结果。

### 11.3 ScopeTaskStats
表示 `scope + task_type` 下的风险、注入与成功统计。

这些对象足以支撑第一阶段，不需要把上下文基础设施对象纳入核心叙事。

---

## 12. 新路线图

## Phase 1：Experience Controller MVP

### 目标
证明经验控制层有独立价值。

### 核心交付
- strategy / warning 提炼
- intervention gating
- usage/helped/harmed 回写
- cooling / retired 状态机

### 不做
- 抽象模式图谱
- 深度 ContextEngine 集成
- team sync
- skill 自动进化

---

## Phase 2：Context-aware Experience Controller

### 目标
更深度利用宿主的 ContextEngine / 历史摘要能力。

### 核心交付
- 更好的 trigger pattern 提取
- 更精细的注入预算控制
- 更稳健的 harm 判断
- 更细粒度的注入位置策略

### 关键变化
ExperienceEngine 更明显地依附上下文基础设施，而不再试图重建它。

---

## Phase 3：Experience Policy Layer

### 目标
从“经验是否注入”升级到“经验介入策略”。

### 核心交付
- task risk map
- conservative / normal / silent 模式
- task_type 差异化策略
- 更成熟的退役机制

此时 ExperienceEngine 才真正具备“runtime policy layer”的形态。

---

## Phase 4：宿主深度集成 / Companion Plugin

### 目标
成为 ContextEngine 生态中的 companion 层或特化实现。

### 核心交付
- 更标准化的输入接口
- 更清晰的宿主依赖边界
- 可兼容不同 ContextEngine 实现的抽象层

---

## 13. 成功标准重写

旧成功标准过于强调“经验系统是否完整”。

新的成功标准应该改成：

### 13.1 产品级
- 相似任务中的首次成功率提升
- 平均重试次数下降
- 重复失败模式减少
- 无效提示比例下降

### 13.2 系统级
- 能持续生成可读、可复用的 strategy / warning
- 能保守地触发注入，而不是乱注入
- 能让一部分低价值经验进入 cooling / retired

### 13.3 战略级
- 能证明 ExperienceEngine 这一层不是 ContextEngine 的简单重复，而是独立价值层

---

## 14. 文档体系应如何调整

今后的文档主线应变为：

1. **重定位说明**：为什么 ExperienceEngine 不再是上下文基础设施
2. **产品定义**：ExperienceEngine = Context-aware Experience Controller
3. **MVP 技术方案**：如何验证经验干预控制有净收益
4. **数据结构 / 状态机**：围绕 ExperienceNode / InjectionEvent / Stats 展开
5. **实验方案**：如何证明经验控制有效

原先与上下文基础设施重叠过深的叙事，应整体降级或移除。

---

## 15. 最终结论

OpenClaw 3.7 与 ContextEngine 的出现，并没有让 ExperienceEngine 失去存在意义。

真正变化的是：

> **宿主已经把上下文基础设施做成了一等能力，因此 ExperienceEngine 必须停止同时扮演“基础设施 + 控制器”两个角色。**

ExperienceEngine 未来最成立的位置是：

> **一个依附于强上下文基础设施之上的经验干预控制层。**

它真正要证明的不是“自己也能管理上下文”，而是：

- 哪些经验值得说出来
- 什么时机说最合适
- 说了之后有没有帮助
- 没帮助就退出

如果这一层被验证成立，那么 ExperienceEngine 依然是一个清晰、有辨识度且值得继续推进的产品方向。

## 配套文档与使用边界

本文件是 ExperienceEngine v2 的**顶层产品定义文档**，负责说明：

- 产品定位
- 问题定义
- 核心边界
- MVP 目标
- 中长期路线

它**不是**最细的工程实现说明。阅读与实施时，建议与以下文档配套使用：

- `ExperienceEngine v2 Master Overview And Doc Map`：整套文档导航与推荐阅读顺序
- `ExperienceEngine v2 MVP Technical Spec (Revised)`：MVP 技术主线与模块关系
- `ExperienceEngine v2 OpenClaw Integration Spec`：宿主 Hook、输入字段、fallback 与集成边界
- `ExperienceEngine v2 Experience Representation Spec`：ExperienceNode 的 Compact Form / Actionable Form 结构
- `ExperienceEngine v2 Experience Extraction Examples`：从 trace 到节点的提炼样例与拒绝规则
- `ExperienceEngine v2 Engineering Blueprint`：目录结构、接口、schema、伪代码与第一阶段编码顺序

如果需要进入实际开发，应以本文件提供方向与边界，再结合上述文档完成具体实现。
