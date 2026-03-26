# ExperienceEngine V3 进度总表

> 版本：2026-03-20  
> 用途：提供一份统一的 V3 任务状态总表，帮助新对话快速恢复上下文  
> 配套文档：
> - [12 个月路线图（裁剪版）](./2026-03-17-experienceengine-12-month-roadmap-design.md)
> - [Explicit Provider Distillation Alignment](./2026-03-20-explicit-provider-distillation-alignment-design.md)
> - [Provider-Based Distillation Architecture](./2026-03-20-provider-based-distillation-architecture-design.md)
> - [Repo Summary Review Design](./2026-03-20-repo-summary-review-design.md)
> - [Provider Distillation Matrix](../../development/provider-distillation-matrix.md)

## 1. 当前结论

ExperienceEngine 当前已经完成了 V3 的大部分核心目标：

- 可学习：`capture -> candidate -> distill -> node`
- 可介入：`skip / inject_conservative / inject`
- 可验证：`helped / harmed / benchmark / case study / evidence package`
- 可资产化：`Experience Pack v1`
- 可编译：`AGENTS.md / CODEX.md / CLAUDE.md / GitHub agent profile`
- 可部署：`deploy / status / drift`
- 可宿主内操作：Codex 已形成较完整的 `agent-first` MCP 面

当前项目已不在“基础可用”阶段，而是在：

**`Phase C` 中后段：把经验从运行时能力继续收口成可管理、可编译、可在宿主内操作的资产系统。**

## 2. V3 总体阶段

### Phase A：Prove the Loop

目标：

- 证明 ExperienceEngine 不是“注入更多提示”，而是带来净收益

当前状态：

- **基本完成**

已完成：

- Injection scorecard
- Shadow / holdout
- Auto feedback attribution
- Task timeline
- Benchmark summary / verdict / suggested mode
- Case study / evidence package
- Repo summary（当前 repo 的统一状态面）

### Phase B：Package the Experience

目标：

- 把数据库里的经验变成可治理资产

当前状态：

- **完成 v1**

已完成：

- Experience Pack 本机共享目录 registry
- 文件事实源 + SQLite 索引
- `draft / review / publish / rollback`
- `enable / disable`
- runtime 按启用 pack 过滤候选

### Phase C：Compile to Hosts

目标：

- 把 Experience Pack 编译成宿主可直接消费的产物

当前状态：

- **已完成大半**

已完成：

- Compiler v1
- Deploy / status / drift 管理面
- Codex 宿主内 Pack / Compiler / Deploy 操作
- Claude 共享 MCP 面验证

未完成：

- 更广的宿主目标覆盖
- 更高层的 repo 周期复盘 / summary 索引

### Phase D：Team Product

目标：

- 团队协作、审批、共享、企业治理

当前状态：

- **未开始，明确后排**

## 3. 已完成能力清单

### 3.1 核心运行时

- V3 运行时对象：
  - `TaskRun`
  - `OutcomeRecord`
  - `ReviewEvent`
- 核心闭环：
  - `capture`
  - `candidate`
  - `distillation`
  - `injection`
  - `feedback`
  - `state transition`

### 3.2 检索与蒸馏

- 本地 embedding 主路径
- `distillationMode`
  - `llm`
  - `rule`
  - `disabled`
- `distillationSource`
  - `explicit_provider`
  - `rule`
  - `disabled`
- `rule -> llm redistill`
- 当前正式产品边界：
  - `llm` 仅指用户显式配置的官方/兼容 LLM API
  - 不再将宿主 LLM 复用视为正式能力

### 3.3 宿主状态

#### Codex

- **当前主宿主，完成度最高**
- 已完成：
  - MCP runtime / interaction
  - cross-runtime launcher
  - pack/compiler/deploy agent-first MCP tools
  - guarded flows
  - workflow prompts
  - real host validation

#### Claude Code

- **交互式使用可用**
- 已完成：
  - hooks + shared MCP
  - cross-runtime launcher
  - SQLite locking 修复
  - `claude-hook` 冷启动收敛
  - transcript-first 非交互验证工具
- 当前边界：
  - `claude -p` 非交互 stdout 仍然 flaky
  - shared MCP resource/tool 可跑，但 `claude -p` 不应被视为稳定自动化入口

#### OpenClaw

- **主宿主验证已做过**
- 已完成：
  - runtime/plugin integration
  - install drift 检测
  - packaged plugin install
  - reinstall safety 保护
  - real scenario validation
- 已知高危点曾记录在本地 operator memory 中，当前应以正式 docs 为准

### 3.4 证明层

- `inspect --last`
- `inspect learning`
- `doctor` 冷启动/蒸馏/pack/compiler 状态
- benchmark
- verdict
- suggested mode
- case study
- evidence package
- repo summary

### 3.5 Experience Pack

- `pack draft create`
- `pack review`
- `pack publish`
- `pack rollback`
- `pack enable`
- `pack disable`
- `pack list`
- `pack inspect`

### 3.6 Compiler / Deploy

已支持 target：

- `agents`
- `codex`
- `claude`
- `github`

已完成能力：

- `pack compile`
- `pack deploy`
- `pack status`
- `missing / up_to_date / drifted`
- compiler visibility / stale status

### 3.7 宿主内 MCP 能力

#### Codex 已完成

低风险直接工具：

- `experienceengine_pack_list`
- `experienceengine_pack_inspect`
- `experienceengine_pack_status`
- `experienceengine_pack_compile`
- `experienceengine_pack_deploy_preview`
- `experienceengine_pack_enable`
- `experienceengine_pack_disable`
- `experienceengine_get_capabilities`
- `experienceengine_get_repo_summary`

高风险确认流：

- `experienceengine_plan_pack_publish`
- `experienceengine_plan_pack_rollback`
- `experienceengine_plan_pack_deploy`
- `experienceengine_execute_planned_pack_operation`

工作流 prompts：

- `experienceengine_review_capabilities`
- `experienceengine_review_pack_status`
- `experienceengine_prepare_pack_publish`
- `experienceengine_prepare_pack_rollback`
- `experienceengine_prepare_pack_deploy`
- `experienceengine_review_repo_status`

稳定 resources：

- `experienceengine://capabilities`
- `experienceengine://repo-summary`
- `experienceengine://packs`
- `experienceengine://pack/{id}`
- `experienceengine://last`
- `experienceengine://learning/summary`

## 4. Deferred / 暂缓项

以下内容已明确不在当前主线：

- host LLM reuse（包括 `host_endpoint` / `host_mediated`）
- review UI
- team/shared registry
- enterprise policy / signing / RBAC
- marketplace
- 通用 memory / RAG 平台化

## 5. 已知边界与约束

### 5.1 Claude 非交互入口

- `claude -p` 的 stdout 仍然不稳定
- transcript 比 stdout 更可靠
- 仅推荐作为开发/验收入口，不作为稳定产品主入口

### 5.2 OpenClaw reinstall 高风险

- 不能再对指向真实 git working tree 的 install/source path 做删除或 path reinstall
- 这条约束必须始终以正式 docs 中的安全说明为准

### 5.3 大改动后的验证原则

对影响真实宿主体验的较大改动：

1. 先跑定向测试
2. 再跑 `pnpm build`
3. 再跑 `pnpm check`
4. 最后补真实宿主验证（至少 Codex）

## 6. 最近关键提交

当前主线最近关键提交包括：

- `20c379e` `fix codex cross-runtime launchers`
- `97a446e` `fix claude cross-runtime hook launchers`
- `5f94cbf` `harden openclaw reinstall safety`
- `17c6737` `slim openclaw packaged plugin dependencies`
- `cc4c5f9` `add experience capabilities mcp surface`
- `374eaa1` `add claude print validation helper`
- `b6c71cc` `add repo summary review surface`

## 7. 下一步主线

当前最合理的后续方向不是继续横向堆功能，而是：

1. **repo 周期复盘 / summary 索引**
   - 让宿主和开发者能看一段时间内的变化，而不仅是当前 snapshot

2. **真实 repo 持续使用驱动**
   - 用真实长期使用数据判断：
     - 哪些 pack 值得保留
     - 哪些 compiled target 最常用
     - benchmark 是否在改善

3. **继续以 Codex 为主宿主推进**
   - Codex 当前最完整
   - 新能力应优先先在 Codex 形成闭环，再考虑别的宿主

4. **显式 API 边界收口**
   - `doctor` / docs / runtime 统一收口为 `explicit_provider + local embedding + rule/disabled fallback`
   - 删除宿主 LLM 复用残留，避免产品边界继续漂移

## 8. 新对话建议入口

如果要在新对话里继续推进，建议先读：

1. [12 个月路线图（裁剪版）](./2026-03-17-experienceengine-12-month-roadmap-design.md)
2. [Explicit Provider Distillation Alignment](./2026-03-20-explicit-provider-distillation-alignment-design.md)
3. [Repo Summary Review Design](./2026-03-20-repo-summary-review-design.md)
4. 历史上的本地项目操作记忆（已移出版本库）
5. 本文档

这样基本就能恢复当前主线，不需要依赖长对话上下文。
