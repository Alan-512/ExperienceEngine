# ExperienceEngine v2 经验提炼样例集（Experience Extraction Examples）

## 1. 文档目标

本文档用于把 ExperienceEngine 的“经验提炼”从抽象设计进一步落到具体样例层。

它要解决的问题是：

> **给定一段真实任务输入 / trace / tool result / outcome signal，Analyzer 应该如何判断是否值得提炼，以及如何把它写成高质量 ExperienceNode。**

本文档服务于：

- Analyzer 规则设计
- 提炼 prompt / parser 设计
- coding agent 实现时的样例参照
- 经验质量人工审查

---

## 2. 使用原则

## 2.1 样例不是唯一写法，但代表推荐写法

这些样例的目的不是限定唯一输出，而是给出：

- 什么样的经验是高质量的
- 什么样的经验应该被拒绝
- compact form 应该写成什么风格
- actionable form 什么时候值得展开

## 2.2 样例优先面向 MVP 范围

所有样例优先覆盖：

- `bug_fix`
- `build_debug`
- `test_debug`
- `integration_fix`

## 2.3 样例以 ExperienceNode 为最终目标

每个正例都尽量给出：

- 输入摘要
- 是否入库
- 推荐 node_type
- Compact Form
- Actionable Form（如适用）
- 为什么这样设计

---

## 3. 正例样例 1：Schema 变更后的类型错误

## 3.1 输入摘要

### task_summary
修改 API schema 后，项目中大量 client/type 相关报错出现。

### tool_events
- 修改了 `schema.graphql`
- 直接运行测试，出现多个类型错误
- 没有先运行 codegen
- 后续手动运行 codegen 后，绝大多数错误消失

### outcome_signal
success

### evidence
- codegen 前存在大量 downstream 类型错误
- codegen 后错误显著减少

## 3.2 是否应入库

**应入库**

原因：
- 可验证
- 高度可复用
- 具结构性
- 明确改变了执行顺序

## 3.3 推荐 node_type

`strategy`

## 3.4 Compact Form

- `trigger_pattern`: schema 变更后出现大量 client/type 错误
- `compact_hint`: 在这个项目里，先重新生成 client/types，再排查 downstream 报错。

## 3.5 Actionable Form

- `goal`: 修复 schema 变更导致的 client/type 错误
- `recommended_steps`:
  1. 确认 schema 修改已保存
  2. 运行 codegen / types generation
  3. 检查生成物是否更新
  4. 再排查 downstream 类型错误
- `avoid_steps`:
  - 不要先直接改业务文件中的表层类型报错
  - 不要在未重新生成 types 前逐个修补 downstream 文件
- `fallback_steps`:
  - 若 codegen 后仍大量报错，检查 schema 引用路径或 codegen 配置
- `success_signal`: codegen 成功且 downstream 类型错误显著减少
- `stop_condition`: codegen 后主要类型错误消失
- `escalation_condition`: codegen 本身失败或生成物未发生变化

## 3.6 为什么这样提炼

这是典型的“高价值前置条件 + 排障顺序”经验，非常适合形成 strategy 节点。

---

## 4. 正例样例 2：429 限流误判为参数问题

## 4.1 输入摘要

### task_summary
调用第三方 API 时返回 429，Agent 最初尝试修改参数结构，没有效果，后续检查限流配额与并发配置后定位问题。

### tool_events
- API 请求返回 429
- Agent 先尝试改请求参数
- 仍然 429
- 后续查看 provider docs / dashboard，发现超过配额

### outcome_signal
success

### evidence
- 调整参数对 429 无帮助
- 查限流后得到明确解释

## 4.2 是否应入库

**应入库**

## 4.3 推荐 node_type

`warning`

## 4.4 Compact Form

- `trigger_pattern`: API 返回 429
- `compact_hint`: 先检查限流/配额，不要先怀疑参数问题或盲目重试。

## 4.5 Actionable Form

- `goal`: 快速判断 429 是否由限流/配额导致
- `recommended_steps`:
  1. 记录 429 返回信息和 provider 错误提示
  2. 查看 provider docs / dashboard 中的限流与配额规则
  3. 确认是否存在并发、频率或额度限制
  4. 只有确认允许时才考虑退避重试
- `avoid_steps`:
  - 不要先大幅调整请求参数
  - 不要在未确认限流原因前反复盲重试
- `fallback_steps`:
  - 若配额正常，再检查身份凭证、环境差异或隐藏请求频率问题
- `success_signal`: 明确确认 429 的限流来源或排除限流原因
- `stop_condition`: 已确认限流/配额为主因
- `escalation_condition`: provider docs 信息不明确或多环境结果不一致

## 4.6 为什么这样提炼

这是典型的“高频误导路径”经验，应该优先写成 warning，并明确 avoid_steps。

---

## 5. 正例样例 3：测试失败先查 fixture/data，而不是先改逻辑

## 5.1 输入摘要

### task_summary
某测试套件失败，报断言不一致。最终发现是 fixture 数据和预期快照未同步，而不是业务逻辑错误。

### tool_events
- 运行 tests，断言失败
- Agent 一开始尝试修改业务逻辑
- 后续检查 fixture 和 snapshot，发现不一致
- 更新 fixture 后测试通过

### outcome_signal
success

## 5.2 是否应入库

**应入库**

## 5.3 推荐 node_type

`strategy`

## 5.4 Compact Form

- `trigger_pattern`: 某类断言测试失败且近期数据/fixture 有调整
- `compact_hint`: 这类测试失败先检查 fixture/data 和 snapshot，再改业务逻辑。

## 5.5 Actionable Form

- `goal`: 快速区分测试失败是数据问题还是逻辑问题
- `recommended_steps`:
  1. 查看失败用例的断言差异
  2. 检查 fixture / mock data / snapshot 是否已同步
  3. 确认最近是否有数据结构调整
  4. 仅在数据层都正常时再排查业务逻辑
- `avoid_steps`:
  - 不要一看到断言失败就先改核心逻辑
- `success_signal`: fixture / snapshot 修正后测试恢复通过

## 5.6 为什么这样提炼

这是典型的“排障优先级”经验，非常适合 strategy 节点。

---

## 6. 正例样例 4：Build 报错源于缓存/生成物未刷新

## 6.1 输入摘要

### task_summary
修改配置后构建失败，错误看起来像代码问题，最后清理缓存并重建后恢复正常。

### tool_events
- 修改 bundler/config
- 构建失败，表面报错指向某模块
- 清理缓存并重新 build 后恢复

### outcome_signal
success

## 6.2 是否应入库

**可入库**，但应更谨慎

原因：
- 若该情况在当前 scope 重复出现，价值很高
- 若只是单次偶发，support_count 应较低，仅 candidate

## 6.3 推荐 node_type

`warning` 或 `strategy`，取决于表述重点

推荐：`warning`

## 6.4 Compact Form

- `trigger_pattern`: 配置修改后出现表面 build/module 错误
- `compact_hint`: 先清理缓存并重建，再判断是否是真正代码问题。

## 6.5 Actionable Form

- `goal`: 排除由缓存/生成物陈旧导致的假性构建错误
- `recommended_steps`:
  1. 识别最近是否改动过 build/config
  2. 清理相关缓存/构建输出
  3. 重新执行 build
  4. 若错误仍存在，再进入代码级排查
- `avoid_steps`:
  - 不要在未清理构建环境前直接大改业务代码
- `success_signal`: 清理后 build 恢复或报错显著变化

## 6.6 为什么这样提炼

这类经验容易有价值，但也容易误判成偶发噪音，因此适合先进入 candidate，再根据 support_count 决定是否升为 active。

---

## 7. 反例样例 1：一次性路径错误

## 7.1 输入摘要

### task_summary
某次命令失败，原因是手误输错了本地路径。

### outcome_signal
success

## 7.2 是否应入库

**不应入库**

## 7.3 原因

- 不具结构性
- 不具复用价值
- 只是一次性失误

## 7.4 正确处理方式

仅保留在宿主上下文 / 日志，不形成 ExperienceNode。

---

## 8. 反例样例 2：纯常识结论

## 8.1 输入摘要

### task_summary
发现 404 是因为请求的资源不存在。

## 8.2 是否应入库

**不应入库**

## 8.3 原因

- 太泛
- 属于普通知识
- 不构成局部执行策略

## 8.4 错误写法示例

- `compact_hint`: 404 说明资源不存在，请检查资源路径。

这类内容看似正确，但不会形成 ExperienceEngine 的有效资产。

---

## 9. 反例样例 3：只有结果，没有动作结构

## 9.1 输入摘要

### task_summary
最后发现问题在 schema。

## 9.2 是否应入库

**不应直接入库**

## 9.3 原因

这只是结论，不是未来可执行 guidance。

### 不足之处
- 没有 trigger
- 没有推荐动作
- 没有成功判据

## 9.4 正确改写方式

如果要入库，至少应改写成：

- `trigger_pattern`: schema 变更后出现 client/type 错误
- `compact_hint`: 在这个项目里先重新生成 client/types，再排查表层类型错误。

---

## 10. 反例样例 4：过度抽象的哲学建议

## 10.1 输入摘要

### task_summary
多次排障后总结：不要着急，要先系统思考。

## 10.2 是否应入库

**不应入库**

## 10.3 原因

- 没有具体 task pattern
- 没有执行动作
- 不适合 runtime 注入

这类内容最多可以作为人类回顾，不属于 ExperienceNode。

---

## 11. 只生成 Compact Form 的情况

不是所有经验都值得补全 Actionable Form。

以下情况建议只生成 Compact Form：

### 11.1 支持证据还不够强
例如：
- 新节点 support_count 只有 1
- 还没有 helped_count

### 11.2 经验本身更多是“提醒”而非“流程”
例如：
- 遇到 429 先查限流

这条提醒很有价值，但不一定每次都要展开成流程。

### 11.3 token 预算敏感
如果节点会高频命中，但每次都展开会太重，先保留 compact 即可。

---

## 12. 值得补全 Actionable Form 的情况

以下情况建议优先补全 Actionable Form：

### 12.1 节点 support_count 高
说明该经验已不止一次被验证。

### 12.2 节点 helped_count 高
说明该经验不只是“相关”，而是真的有帮助。

### 12.3 经验本质是一个局部操作顺序
例如：
- schema → codegen → client → tests
- fixture → snapshot → logic

### 12.4 compact hint 容易被误解
如果一句话容易让 Agent 理解不充分，就应补 Actionable Form。

---

## 13. strategy 与 warning 的写法差异

## 13.1 strategy 写法重点

应更强调：

- 正确动作顺序
- 前置条件
- 成功判据

### 好的 strategy 示例
- 这类 build 问题先检查生成物和配置，再处理表层报错。

### 不好的 strategy 示例
- build 问题要认真排查。

---

## 13.2 warning 写法重点

应更强调：

- 高频误导路径
- 禁忌动作
- 什么时候不要走默认直觉路径

### 好的 warning 示例
- 遇到 429 时不要先怀疑参数，先检查限流和配额。

### 不好的 warning 示例
- API 错误要多检查一下。

---

## 14. Analyzer 输出质量检查清单

coding agent 在实现 Analyzer 时，建议对每条候选节点做以下检查：

### 14.1 是否有明确 trigger_pattern
没有 trigger，就不应入库。

### 14.2 compact_hint 是否足够短且可执行
若只是空泛结论，应拒绝。

### 14.3 是否真的能改变未来执行路径
如果未来即使看到这条经验也不知道怎么行动，则价值偏低。

### 14.4 是否值得展开为 Actionable Form
若值得，至少补：
- goal
- recommended_steps
- success_signal

### 14.5 是否误把普通知识当经验
若是，应拒绝。

---

## 15. 推荐的提炼输出模板

Analyzer 的推荐输出模板如下：

```json
{
  "should_store": true,
  "node_type": "strategy",
  "reason": "该经验具备可验证、可复用、具结构性的排障顺序价值",
  "compact_form": {
    "trigger_pattern": "...",
    "compact_hint": "..."
  },
  "actionable_form": {
    "goal": "...",
    "recommended_steps": ["...", "..."],
    "avoid_steps": ["..."],
    "fallback_steps": ["..."],
    "success_signal": "...",
    "stop_condition": "...",
    "escalation_condition": "..."
  }
}
```

若不应入库：

```json
{
  "should_store": false,
  "reason": "一次性失误 / 普通知识 / 缺乏可执行 guidance / 不具结构性"
}
```

---

## 16. 最终建议

ExperienceEngine 的经验提炼质量，将直接决定这整个产品是不是成立。

因此 Analyzer 不应只会“总结”，而必须学会：

1. **识别什么是未来真正值得介入的经验**
2. **把经验压成短提示而不是空话**
3. **在必要时把经验展开成 mini skill 一样的 guidance**
4. **拒绝那些看似正确、实则无法指导动作的内容**

如果这一步做不好，后续的 Controller、Feedback、Retirement 都会失去意义。

如果这一步做对了，ExperienceEngine 才能真正具备：

> **让 Agent 在未来一看到这条经验，就知道该怎么推进问题。**

