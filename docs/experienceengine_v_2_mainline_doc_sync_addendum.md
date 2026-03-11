# ExperienceEngine v2 主线文档同步修订说明（Mainline Doc Sync Addendum）

## 1. 文档目的

本文档用于同步修订 ExperienceEngine v2 的三份主线文档，使其与后续新增的补强文档保持一致。

这三份主线文档是：

1. `ExperienceEngine v2 Product Definition And Roadmap`
2. `ExperienceEngine v2 MVP Technical Spec`
3. `ExperienceEngine v2 Implementation Plan`

后续新增的补强文档包括：

- `ExperienceEngine v2 Master Overview And Doc Map`
- `ExperienceEngine v2 OpenClaw Integration Spec`
- `ExperienceEngine v2 Experience Representation Spec`
- `ExperienceEngine v2 Experience Extraction Examples`
- `ExperienceEngine v2 Engineering Blueprint`

由于后续又补充了这些更具体的文档，原先三份主线文档虽然主线仍然成立，但需要统一补充：

- 自己在文档体系中的角色
- 与其他文档的边界关系
- coding agent 实施时应如何配套阅读

本文档可视为对这三份文档的统一修订说明。

---

## 2. 对 `ExperienceEngine v2 Product Definition And Roadmap` 的修订说明

### 2.1 该文档的角色

这份文档应明确被定义为：

> **顶层产品定义文档**

它负责说明：

- ExperienceEngine 在 ContextEngine 时代下的产品定位
- 产品要解决的问题
- 产品边界
- MVP 目标
- 中长期演化路线

### 2.2 该文档不负责的内容

这份文档不应再被理解为：

- 最细的工程实现说明
- 最细的宿主接入说明
- 最细的经验节点内容规范
- 最细的目录结构或接口设计说明

### 2.3 推荐补充的引用关系

在文档末尾或靠近结论处，建议补充：

- `ExperienceEngine v2 Master Overview And Doc Map`：用于总览整套文档与阅读顺序
- `ExperienceEngine v2 OpenClaw Integration Spec`：用于宿主接入边界
- `ExperienceEngine v2 Experience Representation Spec`：用于经验内容结构
- `ExperienceEngine v2 Engineering Blueprint`：用于工程实现蓝图

### 2.4 修订后的正确理解

这份文档应被理解为：

> **方向与边界的定义文件**

而不是“直接开写代码时唯一参考的文件”。

---

## 3. 对 `ExperienceEngine v2 MVP Technical Spec` 的修订说明

### 3.1 该文档的角色

这份文档应明确被定义为：

> **MVP 技术设计主方案**

它负责说明：

- MVP 的目标
- 系统模块划分
- Input Adapter / Analyzer / Controller / FeedbackManager 的关系
- MVP 的控制闭环怎么成立

### 3.2 该文档不负责的内容

它不应再被理解为：

- 最终版的数据字段字典
- 最终版的宿主 Hook 接线手册
- 最终版的工程目录和接口清单
- 最终版的经验内容写法规范

### 3.3 推荐补充的引用关系

建议在文档中显式说明：

- **ExperienceNode 内容结构**：以 `ExperienceEngine v2 Experience Representation Spec` 为准
- **宿主 Hook / 输入字段 / fallback 逻辑**：以 `ExperienceEngine v2 OpenClaw Integration Spec` 为准
- **实际代码目录、模块接口、schema、伪代码**：以 `ExperienceEngine v2 Engineering Blueprint` 为准

### 3.4 修订后的正确理解

这份文档应被理解为：

> **MVP 技术主线图**

它说明系统应该怎样工作，但不负责每一个实现细节。

---

## 4. 对 `ExperienceEngine v2 Implementation Plan` 的修订说明

### 4.1 该文档的角色

这份文档应明确被定义为：

> **开发阶段拆解与顺序规划文档**

它负责说明：

- Phase A / B / C / D / E 各做什么
- 模块间依赖关系
- 开发顺序怎么安排
- 每个阶段完成标准是什么

### 4.2 该文档不负责的内容

它不应再被理解为：

- 具体代码目录结构说明
- TypeScript 类型定义说明
- SQLite schema 说明
- OpenClaw 插件入口设计说明
- Hook handler 伪代码说明

### 4.3 推荐补充的引用关系

建议明确补充：

- **工程目录结构、接口设计、schema、伪代码**：以 `ExperienceEngine v2 Engineering Blueprint` 为准
- **ExperienceNode 内容结构**：以 `ExperienceEngine v2 Experience Representation Spec` 为准
- **宿主集成细节**：以 `ExperienceEngine v2 OpenClaw Integration Spec` 为准

### 4.4 修订后的正确理解

这份文档应被理解为：

> **开发推进顺序与阶段性验收标准文件**

而不是完整的编码手册。

---

## 5. 建议你现在对整套文档的理解方式

修订后，建议把 ExperienceEngine v2 文档体系理解为三层：

### 第一层：方向与主线

- `ExperienceEngine v2 Master Overview And Doc Map`
- `ExperienceEngine v2 Product Definition And Roadmap`
- `ExperienceEngine v2 MVP Technical Spec`

这一层回答：

- 它是什么
- 为什么值得做
- MVP 应该验证什么

### 第二层：实施与实现

- `ExperienceEngine v2 Implementation Plan`
- `ExperienceEngine v2 OpenClaw Integration Spec`
- `ExperienceEngine v2 Engineering Blueprint`

这一层回答：

- 先做什么
- 接什么 Hook
- 代码怎么组织

### 第三层：数据、内容与验证

- `ExperienceEngine v2 Data Model And State Machine Spec`
- `ExperienceEngine v2 Experience Representation Spec`
- `ExperienceEngine v2 Experience Extraction Examples`
- `ExperienceEngine v2 Experiment And Evaluation Plan`

这一层回答：

- 经验长什么样
- 生命周期怎么走
- 怎么从 trace 提炼
- 怎么验证产品是否成立

---

## 6. coding agent 的最终阅读顺序（修订版）

如果现在把整套方案交给 coding agent，推荐按以下顺序阅读：

1. `ExperienceEngine v2 Master Overview And Doc Map`
2. `ExperienceEngine v2 Product Definition And Roadmap`
3. `ExperienceEngine v2 MVP Technical Spec`
4. `ExperienceEngine v2 OpenClaw Integration Spec`
5. `ExperienceEngine v2 Data Model And State Machine Spec`
6. `ExperienceEngine v2 Experience Representation Spec`
7. `ExperienceEngine v2 Experience Extraction Examples`
8. `ExperienceEngine v2 Implementation Plan`
9. `ExperienceEngine v2 Engineering Blueprint`
10. `ExperienceEngine v2 Experiment And Evaluation Plan`

---

## 7. 最终结论

v2 主线文档的核心方向不需要重写，但随着后续补强文档出现，确实需要统一口径：

- `Product Definition And Roadmap` 是顶层方向文档
- `MVP Technical Spec` 是技术主线文档
- `Implementation Plan` 是开发顺序与阶段文档

而：

- 宿主接入看 `OpenClaw Integration Spec`
- 经验内容看 `Experience Representation Spec`
- 提炼细节看 `Experience Extraction Examples`
- 工程实现看 `Engineering Blueprint`

这样整套文档才不会出现“主线文件和补强文件角色重叠”的问题。

从现在开始，你可以直接按这个修订说明来使用整套 v2 文档，而不必再担心它们之间存在叙事冲突。

