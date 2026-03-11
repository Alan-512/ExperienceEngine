# ExperienceEngine v2 总纲与文档导航（Master Overview）

## 1. 文档目的

本文档是 ExperienceEngine v2 文档体系的总入口。

它的作用不是重复各份文档的详细内容，而是回答以下问题：

1. ExperienceEngine 现在到底是什么产品
2. 它在 OpenClaw / ContextEngine 生态中的准确位置是什么
3. 整套文档分别负责说明什么
4. 如果要直接交给 coding agent 实施，应该按什么顺序阅读
5. 当前方案的边界、默认假设和实施前提是什么

本文档应作为整个项目的第一阅读入口。

---

## 2. 项目当前最准确定义

### 2.1 一句话定义

**ExperienceEngine 是一个绑定 OpenClaw、依附其 Memory 与 ContextEngine 基础设施之上的经验干预控制层（Context-aware Experience Controller）。**

它不负责成为主上下文引擎，而是负责：

- 从真实任务执行中提炼 strategy / warning 经验
- 判断这些经验是否值得介入当前任务
- 记录经验介入后的帮助与干扰
- 让低价值经验动态退出注入池

### 2.2 它不是什么

ExperienceEngine 不是：

- 不是新的 long-term memory plugin
- 不是主 context assembly 引擎
- 不是 lossless context manager
- 不是 DAG 摘要系统
- 不是 recall 主工具层
- 不是完整 Skill 系统
- 不是 RL 训练框架

### 2.3 它和宿主生态的关系

OpenClaw 生态中：

- **Memory** 负责信息连续性和 agent-facing memory
- **ContextEngine** 负责上下文摄取、压缩、组装与生命周期
- **ExperienceEngine** 负责经验是否介入、介入是否有效、无效经验如何退出

因此 ExperienceEngine 的定位是：

> **站在 ContextEngine / task trace / tool result 之上的经验控制层**

---

## 3. 项目核心目标

ExperienceEngine 当前阶段的核心目标不是“让 Agent 记得更多”，而是：

> **让 Agent 在相似任务中，更少重复踩坑、更少无效重试，并在真正需要时得到更少但更有用的经验介入。**

进一步拆解就是：

1. 提炼真正值得未来复用的执行经验
2. 判断当前任务是否值得被这些经验打断
3. 用最小 token 成本提供可执行 guidance
4. 让长期无用或有害的经验退出控制层

---

## 4. 当前方案的默认边界

### 4.1 当前绑定宿主

当前方案默认绑定：

- **OpenClaw** 作为宿主 Agent Runtime

### 4.2 当前依赖前提

当前方案默认依赖 OpenClaw / 宿主提供以下输入能力：

- task trace / tool result
- task summary
- outcome signal
- 可选的 context summary / compacted history summary

### 4.3 当前作用域单位

当前方案默认以：

- `repo / workspace + task_type`

作为经验作用域边界。

### 4.4 当前任务范围

当前仅聚焦：

- `bug_fix`
- `build_debug`
- `test_debug`
- `integration_fix`

### 4.5 当前不做范围

当前明确不做：

- 长会话主压缩引擎
- 主 context assembly
- recall 主工具系统
- 通用跨宿主适配
- 团队共享经验
- skill 自动进化
- 抽象 pattern 图谱

---

## 5. 文档总览

当前文档体系建议按以下层次理解。

### A. 产品与路线层

#### 1. `ExperienceEngine v2 Product Definition And Roadmap`

说明：

- 产品是什么
- 为什么在 ContextEngine 时代仍值得做
- 它的边界是什么
- MVP 和后续路线图是什么

用途：

- 产品定位
- 战略对齐
- 统一团队理解

---

### B. 技术方案层

#### 2. `ExperienceEngine v2 MVP Technical Spec`

说明：

- MVP 验证目标是什么
- 系统模块如何划分
- 输入、分析、控制、反馈四层如何工作

用途：

- 技术设计主方案
- coding agent 了解系统分层的核心依据

#### 3. `ExperienceEngine v2 Implementation Plan`

说明：

- MVP 开发顺序
- 每个 Phase 做什么
- 模块依赖关系
- 完成标准是什么

用途：

- 开发排期
- 编码顺序
- 任务拆解

---

### C. 数据与控制层

#### 4. `ExperienceEngine v2 Data Model And State Machine Spec`

说明：

- ExperienceNode / InjectionEvent / ScopeTaskStats 等模型
- 节点生命周期状态机
- helped / harmed / retired 的更新规则

用途：

- 数据库建模
- 状态机实现
- 控制逻辑实现

#### 5. `ExperienceEngine v2 Experience Representation Spec`

说明：

- 经验到底记什么
- 不记什么
- Compact Form 与 Actionable Form 的区别
- 如何让经验表现得像“迷你 Skill”

用途：

- Analyzer 输出结构设计
- 经验内容质量控制
- 提升经验可执行性

---

### D. 验证与评估层

#### 6. `ExperienceEngine v2 Experiment And Evaluation Plan`

说明：

- 怎么验证 ExperienceEngine 这层是否有净收益
- 看哪些指标
- 如何判断方向是否成立

用途：

- MVP 评估
- 参数调优
- 是否进入 v1 的判断依据

---

### E. 宿主集成层（新增）

#### 7. `ExperienceEngine v2 OpenClaw Integration Spec`

说明：

- 具体接哪些 OpenClaw hook
- 每个 hook 输入输出什么
- 哪些字段是必须的、哪些可选
- 和 ContextEngine / Memory 的边界怎么处理

用途：

- 实际插件开发
- 和宿主对齐
- coding agent 具体实现接线图

---

### F. Analyzer 样例层（新增）

#### 8. `ExperienceEngine v2 Experience Extraction Examples`

说明：

- 给出从 trace 到 ExperienceNode 的示例
- 说明哪些 trace 应入库、哪些应拒绝
- 说明何时只产出 compact form，何时补 action form

用途：

- 提炼器 prompt / 规则设计
- 保障经验输出质量
- 为 coding agent 提供可模仿样例

---

## 6. coding agent 的推荐阅读顺序

如果要把当前方案交给 coding agent 实施，建议按以下顺序阅读：

### 第一步：先建立总体理解
1. `ExperienceEngine v2 Product Definition And Roadmap`
2. 本文档 `Master Overview`

### 第二步：理解 MVP 技术主线
3. `ExperienceEngine v2 MVP Technical Spec`
4. `ExperienceEngine v2 Implementation Plan`

### 第三步：理解数据和经验结构
5. `ExperienceEngine v2 Data Model And State Machine Spec`
6. `ExperienceEngine v2 Experience Representation Spec`

### 第四步：理解宿主接入和提炼规则
7. `ExperienceEngine v2 OpenClaw Integration Spec`
8. `ExperienceEngine v2 Experience Extraction Examples`

### 第五步：理解如何验证成功
9. `ExperienceEngine v2 Experiment And Evaluation Plan`

---

## 7. 当前最重要的实施原则

coding agent 在实施时，必须遵守以下原则：

### 7.1 不重做 ContextEngine 已负责的能力

不要在 ExperienceEngine 中实现：

- 主 compaction
- 主 context assembly
- lossless history persistence
- recall 主工具层

### 7.2 ExperienceEngine 的核心是“控制”而不是“堆知识”

所有实现都应围绕：

- 经验提炼
- 介入判断
- 效果回写
- 经验退役

### 7.3 优先保证可解释性

MVP 阶段宁可更保守，也不要让系统变成黑盒乱注入。

### 7.4 优先保证经验可执行

经验节点不能只有“相关性”，还要具备：

- 触发条件
- 最短提示
- 推荐动作顺序
- 禁忌动作
- 成功判据

### 7.5 优先保证低开销

ExperienceEngine 必须是轻量控制层，而不是第二个重型引擎。

---

## 8. 当前实现的最小闭环

coding agent 实施时，不要迷失在大设计里。

当前最小闭环是：

1. 从 OpenClaw 收到任务输入、trace、tool result、outcome signal
2. 产出 ExperienceInput
3. 基于 ExperienceInput 提炼 strategy / warning
4. 存储 ExperienceNode
5. 下一次相似任务中，InterventionController 判断是否需要介入
6. 若需要，最多注入 1–3 条 compact hints（必要时展开 1 条 Actionable Form）
7. 任务结束后更新 helped / harmed / state

只要这一条闭环跑通，ExperienceEngine MVP 就成立了一半。

---

## 9. 当前方案的默认成功标准

当前方案默认以以下标准判断 MVP 是否成立：

### 产品级
- 相似任务首次成功率提升
- 平均重试次数下降
- 重复失败模式减少

### 系统级
- 可持续生成高质量 strategy / warning
- 介入触发足够保守
- 一部分低价值经验进入 cooling / retired

### 结构级
- ExperienceNode 内容不仅可检索，而且可执行

---

## 10. 当前仍需保持警惕的风险

这套文档已经足够指导实施，但仍需记住几个现实风险：

### 10.1 宿主信号未必稳定
OpenClaw 当前 ContextEngine / 插件生态仍在快速演进，具体 hook 细节可能变化。

### 10.2 Analyzer 质量是核心成败点
如果提炼出来的 ExperienceNode 质量不高，控制层再漂亮也没有用。

### 10.3 harmed 的归因天然不完美
MVP 阶段只能做启发式判断，不能假装自己有严格因果归因。

### 10.4 Actionable Form 很容易写得太重
如果每条经验都膨胀成 mini-playbook，token 和复杂度都会上升。

### 10.5 过早做跨宿主抽象会稀释价值验证
当前重点仍应是：先在 OpenClaw 上证明 ExperienceEngine 这层成立。

---

## 11. 最终建议

在当前阶段，ExperienceEngine 已经不再是一个“想法集合”，而是一套可进入工程实施的方案。

但 coding agent 在实施时必须始终牢记：

> **ExperienceEngine 的价值，不在于管理更多上下文，而在于决定哪些经验值得介入当前任务，并在它们无效时让它们退出。**

这句话应该作为整个实现过程中的最高约束。

