# ExperienceEngine v2 工程实现蓝图（Engineering Blueprint）

## 1. 文档目标

本文档是 ExperienceEngine v2 的工程实现蓝图。

它不是产品文档，也不是高层技术方案，而是：

> **一份可以直接交给 coding agent 开始搭建项目与编写代码的实现级规格说明。**

本文档要解决的问题是：

1. 项目代码结构应该怎么组织
2. 核心模块分别负责什么
3. 模块之间如何通信
4. SQLite / 向量索引 / 日志如何落地
5. OpenClaw 插件入口如何接入
6. 第一阶段应该先实现哪些文件、哪些接口、哪些伪代码路径

本文档默认读者已经看过：

- `ExperienceEngine v2 Master Overview And Doc Map`
- `ExperienceEngine v2 Product Definition And Roadmap`
- `ExperienceEngine v2 MVP Technical Spec`
- `ExperienceEngine v2 OpenClaw Integration Spec`
- `ExperienceEngine v2 Data Model And State Machine Spec`
- `ExperienceEngine v2 Experience Representation Spec`

---

## 2. 工程目标

ExperienceEngine v2 的工程目标不是直接做完整产品，而是先落地一个：

> **可运行、可观测、可实验的 OpenClaw MVP 插件**

它必须具备以下能力：

- 接收 OpenClaw 宿主输入
- 形成标准化 `ExperienceInput`
- 提炼 `strategy / warning`
- 存储 `ExperienceNode`
- 在任务开始前做 intervention gating
- 注入 1–3 条 compact hints（必要时展开 1 条 actionable guidance）
- 回写 `helped / harmed / state`
- 提供基本 CLI 与调试能力

### 2.1 当前插件形态约束（新增）

该 MVP 应作为普通 OpenClaw plugin 落地，而不是 ContextEngine slot plugin。

因此工程实现必须包含：

- `openclaw.plugin.json`
- 插件入口文件
- `register(api)` 绑定逻辑
- 可选 `configSchema` / `uiHints`

当前阶段不做：

- `kind: "context-engine"`
- 接管主 context assembly
- 依赖 ContextEngine 私有 schema

---

## 3. 技术栈建议

## 3.1 语言与运行时

推荐：

- TypeScript
- Node.js 20+

原因：

- 与 OpenClaw 插件生态更自然兼容
- 类型系统更适合规范化 ExperienceNode / InjectionEvent 等对象
- 适合做本地 CLI、SQLite、JSONL、向量检索桥接

## 3.2 存储

推荐：

- SQLite：主元数据数据库
- 向量索引：可替换接口（LanceDB 仅作为候选实现）
- JSONL：运行日志 / 调试日志 / 审计日志

说明：

- SQLite 和 JSONL 是 MVP 必选
- 向量索引不是第一阶段硬阻塞项
- 若 LanceDB Node 依赖原生构建或 postinstall，应延后到兼容性验证后再启用

## 3.3 包管理与构建

推荐：

- pnpm
- tsup 或 tsx + tsc

---

## 4. 项目目录结构

建议初始目录如下：

```text
experienceengine/
  package.json
  openclaw.plugin.json
  tsconfig.json
  README.md
  .env.example

  src/
    index.ts
    plugin/
      openclaw-plugin.ts
      hooks/
        before-prompt-build.ts
        tool-result-persist.ts
        message-sent.ts

    config/
      default-config.ts
      config-schema.ts
      load-config.ts

    types/
      domain.ts
      plugin.ts
      storage.ts
      analyzer.ts

    input/
      input-adapter.ts
      scope-resolver.ts
      tasktype-resolver.ts
      outcome-resolver.ts
      context-summary-adapter.ts

    analyzer/
      experience-analyzer.ts
      strategy-extractor.ts
      warning-extractor.ts
      node-deduper.ts
      node-normalizer.ts
      storage-gate.ts

    controller/
      intervention-controller.ts
      trigger-evaluator.ts
      candidate-retriever.ts
      node-ranker.ts
      injection-renderer.ts

    feedback/
      feedback-manager.ts
      harm-detector.ts
      state-transition.ts
      stats-updater.ts

    store/
      sqlite/
        db.ts
        migrations.ts
        schema.sql
        repositories/
          scope-repo.ts
          input-record-repo.ts
          node-repo.ts
          injection-repo.ts
          stats-repo.ts
          candidate-repo.ts
      vector/
        lancedb.ts
        embeddings.ts
        node-index.ts
      logs/
        jsonl-logger.ts

    cli/
      index.ts
      commands/
        stats.ts
        inspect.ts
        disable.ts
        remember.ts

    utils/
      clock.ts
      ids.ts
      hashing.ts
      text.ts
      errors.ts

  data/
    sqlite/
    vector/
    logs/

  tests/
    unit/
    integration/
    fixtures/
```

---

## 5. 核心模块职责

## 5.1 `plugin/`

### 目标
承载 OpenClaw 插件入口和 Hook 绑定逻辑。

### 职责
- 接入宿主 hook
- 实现 OpenClaw plugin `register(api)` 入口
- 调用 InputAdapter / Controller / Analyzer / FeedbackManager
- 做最轻的参数整理和异常保护

### 明确不做
- 不在 hook 文件里写业务逻辑
- 不直接写数据库逻辑
- 不直接写复杂判断逻辑
- 不把 internal hooks 和 plugin lifecycle callbacks 混为一层

---

## 5.2 `input/`

### 目标
把宿主事件标准化为 `ExperienceInput`。

### 子模块职责

#### `input-adapter.ts`
统一组装：
- scope_id
- task_type
- task_summary
- tool_events
- outcome_signal
- context_summary
- injected_node_ids

#### `scope-resolver.ts`
负责：
- repo/workspace 识别
- scope_id 生成
- scope fallback

#### `tasktype-resolver.ts`
负责：
- 将任务归为 `bug_fix / build_debug / test_debug / integration_fix / unknown`

#### `outcome-resolver.ts`
负责：
- 将工具结果、用户反馈、后续错误重复等信号归并成 `success / failure / unknown`
- 明确该字段是 ExperienceEngine 推断值，而不是宿主硬字段

#### `context-summary-adapter.ts`
负责：
- 适配宿主可选提供的 context summary
- 允许无该字段时退化运行

---

## 5.3 `analyzer/`

### 目标
把输入转成可存储、可注入的 ExperienceNode。

### 子模块职责

#### `experience-analyzer.ts`
总调度器：
- 检查输入完整性
- 调用 strategy/warning extractor
- 调用 storage gate
- 调用 deduper / normalizer

#### `strategy-extractor.ts`
从成功任务中提炼：
- Compact Form
- Actionable Form（如适用）

#### `warning-extractor.ts`
从失败或误导路径中提炼：
- warning compact form
- avoid_steps / escalation_condition

#### `node-deduper.ts`
对已有节点做：
- trigger_pattern 相似度判断
- compact_hint 相似度判断
- 合并 support_count

#### `node-normalizer.ts`
做：
- 文本裁剪
- step 数量限制
- 字段规范化

#### `storage-gate.ts`
判断候选经验是否应入库：
- 可验证
- 可复用
- 具结构性

---

## 5.4 `controller/`

### 目标
实现 ExperienceEngine 最核心的运行时控制逻辑。

### 子模块职责

#### `intervention-controller.ts`
总调度器，输出：
- `skip`
- `inject_conservative`
- `inject`

#### `trigger-evaluator.ts`
判断当前任务是否值得进入经验候选检索。

输入可包括：
- `ScopeTaskStats`
- 当前 `task_summary`
- `context_summary`
- 命中的 `error_signature`

#### `candidate-retriever.ts`
从：
- SQLite 元数据
- LanceDB 向量索引
中检索候选 ExperienceNode

#### `node-ranker.ts`
根据：
- state
- trigger match
- helped_ratio
- support_count
- recency
做排序

#### `injection-renderer.ts`
负责生成：
- compact hints block
- （必要时）单条节点的展开 guidance

---

## 5.5 `feedback/`

### 目标
在任务结束后，基于结果反馈更新节点状态。

### 子模块职责

#### `feedback-manager.ts`
总调度器：
- 更新 usage/helped/harmed
- 调用状态迁移
- 更新 stats

#### `harm-detector.ts`
基于启发式识别：
- 是否出现明显误介入

#### `state-transition.ts`
实现：
- candidate → active
- active → cooling
- cooling → active
- cooling → retired
- candidate → retired

#### `stats-updater.ts`
更新 `ScopeTaskStats`

---

## 5.6 `store/`

### 目标
提供统一的数据存储层。

### 设计原则
- 业务代码不直接拼 SQL
- 通过 repository 层访问 SQLite
- 向量索引统一走 vector 模块
- JSONL 日志统一走 logger
- 向量索引实现必须允许被替换或禁用

---

## 5.7 `cli/`

### 目标
提供最低限度的可见性和人工治理能力。

### MVP 命令
- `ee stats`
- `ee inspect <task_type>`
- `ee disable <task_type>`
- `ee disable --scope`
- `ee remember "<rule>"`

---

## 6. 核心 TypeScript 类型定义建议

建议将以下核心类型集中在 `src/types/domain.ts`。

```ts
type TaskType = "bug_fix" | "build_debug" | "test_debug" | "integration_fix"
type ResolvedTaskType = TaskType | "unknown"

type ExperienceState = "candidate" | "active" | "cooling" | "retired"
type ExperienceNodeType = "strategy" | "warning"
type InjectionMode = "skip" | "inject_conservative" | "inject"
type OutcomeSignal = "success" | "failure" | "unknown"

type Scope = {
  scope_id: string
  scope_type: "workspace" | "repo"
  scope_name: string
  root_path?: string
  is_disabled: boolean
  created_at: string
  updated_at: string
}

type ToolEvent = {
  event_id: string
  tool_name: string
  input_summary?: string
  output_summary?: string
  status: "success" | "failure" | "unknown"
  exit_code?: number
  error_signature?: string
  started_at: string
  ended_at?: string
}

type ExperienceInput = {
  scope_id: string
  task_type: ResolvedTaskType
  task_summary: string
  tool_events: ToolEvent[]
  outcome_signal: OutcomeSignal
  context_summary?: string
  injected_node_ids: string[]
}

type ExperienceNode = {
  id: string
  node_type: ExperienceNodeType
  scope_id: string
  task_type: TaskType
  trigger_pattern: string
  applicability_notes?: string
  env_signature?: string
  compact_hint: string
  goal?: string
  recommended_steps?: string[]
  avoid_steps?: string[]
  fallback_steps?: string[]
  success_signal: string
  stop_condition?: string
  escalation_condition?: string
  evidence_summary: string
  source_kind: "system_derived" | "user_authored_candidate_promoted"
  state: ExperienceState
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

type InjectionEvent = {
  injection_id: string
  scope_id: string
  task_type: TaskType
  mode: Exclude<InjectionMode, "skip">
  injected_node_ids: string[]
  injection_count: number
  was_successful: boolean | null
  harm_observed: boolean | null
  created_at: string
  resolved_at?: string
}

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

---

## 7. SQLite 表结构建议

建议将 `src/store/sqlite/schema.sql` 写成明确版本化 schema。

```sql
CREATE TABLE IF NOT EXISTS scopes (
  scope_id TEXT PRIMARY KEY,
  scope_type TEXT NOT NULL,
  scope_name TEXT NOT NULL,
  root_path TEXT,
  is_disabled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS experience_input_records (
  record_id TEXT PRIMARY KEY,
  scope_id TEXT NOT NULL,
  session_id TEXT,
  task_type TEXT NOT NULL,
  task_summary TEXT NOT NULL,
  outcome_signal TEXT NOT NULL,
  context_summary TEXT,
  evidence_json TEXT NOT NULL,
  injected_node_ids_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS experience_nodes (
  id TEXT PRIMARY KEY,
  node_type TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  task_type TEXT NOT NULL,
  trigger_pattern TEXT NOT NULL,
  applicability_notes TEXT,
  env_signature TEXT,
  compact_hint TEXT NOT NULL,
  goal TEXT,
  recommended_steps_json TEXT,
  avoid_steps_json TEXT,
  fallback_steps_json TEXT,
  success_signal TEXT NOT NULL,
  stop_condition TEXT,
  escalation_condition TEXT,
  evidence_summary TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  state TEXT NOT NULL,
  usage_count INTEGER NOT NULL DEFAULT 0,
  helped_count INTEGER NOT NULL DEFAULT 0,
  harmed_count INTEGER NOT NULL DEFAULT 0,
  support_count INTEGER NOT NULL DEFAULT 1,
  last_used_at TEXT,
  last_helped_at TEXT,
  last_harmed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS injection_events (
  injection_id TEXT PRIMARY KEY,
  record_id TEXT,
  scope_id TEXT NOT NULL,
  task_type TEXT NOT NULL,
  mode TEXT NOT NULL,
  injected_node_ids_json TEXT NOT NULL,
  injection_count INTEGER NOT NULL,
  was_successful INTEGER,
  harm_observed INTEGER,
  created_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS scope_task_stats (
  scope_id TEXT NOT NULL,
  task_type TEXT NOT NULL,
  total_tasks INTEGER NOT NULL DEFAULT 0,
  success_tasks INTEGER NOT NULL DEFAULT 0,
  failed_tasks INTEGER NOT NULL DEFAULT 0,
  unknown_tasks INTEGER NOT NULL DEFAULT 0,
  injected_tasks INTEGER NOT NULL DEFAULT 0,
  injected_success_tasks INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (scope_id, task_type)
);

CREATE TABLE IF NOT EXISTS user_authored_candidates (
  id TEXT PRIMARY KEY,
  scope_id TEXT NOT NULL,
  raw_text TEXT NOT NULL,
  normalized_hint TEXT NOT NULL,
  suggested_task_type TEXT,
  state TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

---

## 8. 向量索引设计建议

LanceDB 只索引真正需要语义检索的字段，不要把整张表全塞进去。

建议索引字段：

- `id`
- `scope_id`
- `task_type`
- `node_type`
- `trigger_pattern`
- `compact_hint`
- `goal`
- `state`
- `helped_count`
- `support_count`

向量文本建议为：

```text
{trigger_pattern}
{compact_hint}
{goal}
{recommended_steps.join(" ")}
{avoid_steps.join(" ")}
```

注意：
- `recommended_steps` 过长时要裁剪
- 不要把完整 evidence_summary 放进 embedding 主文本

---

## 9. 配置结构建议

建议 `config-schema.ts` 中定义如下配置：

```ts
type ExperienceEngineConfig = {
  enabled: boolean
  data_dir: string
  max_injected_nodes: number
  max_expanded_nodes: number
  cold_start_task_count: number
  min_support_for_active: number
  cooling_after_no_help_count: number
  retire_after_no_help_count: number
  retire_after_harm_count: number
  enable_context_summary: boolean
  log_level: "debug" | "info" | "warn" | "error"
}
```

推荐默认值：

```ts
{
  enabled: true,
  data_dir: ".experienceengine",
  max_injected_nodes: 3,
  max_expanded_nodes: 1,
  cold_start_task_count: 10,
  min_support_for_active: 2,
  cooling_after_no_help_count: 3,
  retire_after_no_help_count: 5,
  retire_after_harm_count: 2,
  enable_context_summary: true,
  log_level: "info"
}
```

---

## 10. OpenClaw 插件入口设计

建议 `src/plugin/openclaw-plugin.ts` 作为唯一插件入口文件。

职责：
- 初始化 config
- 初始化 SQLite / LanceDB / logger
- 构造 repositories
- 构造核心 services
- 导出 OpenClaw 所需 hook handlers

伪代码：

```ts
export function createExperienceEnginePlugin() {
  const config = loadConfig()
  const db = createSqliteDb(config)
  const vectorIndex = createVectorIndex(config)
  const logger = createJsonlLogger(config)

  const repos = createRepositories(db)
  const services = createServices({ config, repos, vectorIndex, logger })

  return {
    name: "experienceengine",
    hooks: {
      before_prompt_build: createBeforePromptBuildHandler(services),
      tool_result_persist: createToolResultPersistHandler(services),
      message_sent: createMessageSentHandler(services),
    },
  }
}
```

---

## 11. Hook Handler 伪代码

## 11.1 `before-prompt-build.ts`

```ts
export async function handleBeforePromptBuild(ctx: HookContext) {
  const input = await inputAdapter.buildPartialInput(ctx)
  if (!input || input.task_type === "unknown") return { mode: "skip" }

  const decision = await interventionController.decide(input)
  if (decision.mode === "skip") return { mode: "skip" }

  await injectionRepo.create(decision.injectionEvent)
  return {
    prependContext: decision.renderedHints,
  }
}
```

### 要点
- 快速返回
- 不做重分析
- 不做大规模扫描

---

## 11.2 `tool-result-persist.ts`

```ts
export async function handleToolResultPersist(ctx: HookContext) {
  const toolEvent = inputAdapter.extractToolEvent(ctx)
  if (!toolEvent) return
  await inputRecordRepo.appendToolEvent(toolEvent)
  await logger.log("tool_result_persist", toolEvent)
}
```

### 要点
- 只做采集和标准化
- 不在这里做节点提炼

---

## 11.3 `message-sent.ts`

```ts
export async function handleMessageSent(ctx: HookContext) {
  const inputRecord = await inputAdapter.finalizeInputRecord(ctx)
  if (!inputRecord || inputRecord.task_type === "unknown") return

  const analyzerResult = await experienceAnalyzer.analyze(inputRecord)
  await persistenceLayer.storeAnalyzerResult(analyzerResult)

  const recentInjection = await injectionRepo.findLatestForRecord(inputRecord.record_id)
  if (recentInjection) {
    await feedbackManager.process(inputRecord, recentInjection)
  }
}
```

### 要点
- 这里是“后处理主入口”
- 可以比 prompt build 阶段略重

---

## 12. 核心服务接口建议

## 12.1 `InputAdapter`

```ts
interface InputAdapter {
  buildPartialInput(ctx: unknown): Promise<ExperienceInput | null>
  extractToolEvent(ctx: unknown): ToolEvent | null
  finalizeInputRecord(ctx: unknown): Promise<ExperienceInputRecord | null>
}
```

## 12.2 `ExperienceAnalyzer`

```ts
interface ExperienceAnalyzer {
  analyze(input: ExperienceInputRecord): Promise<AnalyzerResult>
}
```

## 12.3 `InterventionController`

```ts
interface InterventionController {
  decide(input: ExperienceInput): Promise<InterventionDecision>
}
```

## 12.4 `FeedbackManager`

```ts
interface FeedbackManager {
  process(input: ExperienceInputRecord, injection: InjectionEvent): Promise<void>
}
```

---

## 13. Analyzer 实现建议

Analyzer 不建议一开始就完全依赖 LLM 黑盒。推荐结构：

### Step 1：规则先筛
判断是否值得提炼：
- 有没有 outcome signal
- 有没有明确 evidence
- 是否属于支持 task_type

### Step 2：轻量生成候选
可以通过：
- 模板化规则
- 少量 LLM 精炼

### Step 3：结构化输出
严格输出：
- should_store
- node_type
- compact_form
- actionable_form（可选）

### Step 4：normalizer + deduper
控制长度、字段合法性、重复合并。

---

## 14. InterventionController 实现建议

推荐分三步：

### Step 1：trigger gate
先决定是否值得查经验。

### Step 2：candidate retrieval
仅在 gate 通过时检索候选节点。

### Step 3：rank + render
排序后仅保留 1–3 条，必要时展开 1 条节点。

绝不要写成：
- 每次任务都先大范围检索全部经验
- 再慢慢决定要不要用

---

## 15. FeedbackManager 实现建议

反馈逻辑建议分两层：

### 层 1：弱归因
基于：
- 任务是否 success
- 是否重复同一错误
- 是否用户明确否定

更新 usage/helped/harmed

### 层 2：状态迁移
基于阈值：
- 连续 no-help
- harm 次数
- support_count

更新 candidate / active / cooling / retired

---

## 16. JSONL 日志格式建议

建议统一格式：

```json
{
  "ts": "2026-03-10T12:00:00Z",
  "phase": "before_prompt_build",
  "scope_id": "repo:example",
  "task_type": "build_debug",
  "message": "intervention decision computed",
  "payload": {}
}
```

推荐日志文件：
- `input_adapter_events.jsonl`
- `analyzer_events.jsonl`
- `injection_events.jsonl`
- `feedback_events.jsonl`
- `errors.jsonl`

---

## 17. 单元测试建议

优先写这几类测试：

### 17.1 `tasktype-resolver` 测试
确保常见输入能归到正确 task_type。

### 17.2 `storage-gate` 测试
确保一次性事实 / 普通知识 / 无法执行 guidance 的内容被拒绝。

### 17.3 `node-deduper` 测试
确保重复经验不会无限膨胀。

### 17.4 `trigger-evaluator` 测试
确保不该介入时能稳定 skip。

### 17.5 `state-transition` 测试
确保 candidate / active / cooling / retired 迁移正确。

---

## 18. 集成测试建议

至少做两条端到端集成测试：

### Case A：成功经验闭环
- 输入 task summary + tool events + success outcome
- 产出 strategy node
- 下次相似任务命中并注入
- 任务成功后 updated helped_count

### Case B：误介入退役闭环
- 节点多次注入无明显帮助
- 或出现 harm
- 最终进入 cooling / retired

---

## 19. 第一阶段开发顺序（最小编码路径）

coding agent 应按这个顺序实现：

### Step 1
- `types/domain.ts`
- `config/*`
- `store/sqlite/schema.sql`
- `store/sqlite/db.ts`

### Step 2
- repositories
- `jsonl-logger.ts`
- `input-adapter.ts`
- `scope-resolver.ts`
- `tasktype-resolver.ts`
- `outcome-resolver.ts`

### Step 3
- `experience-analyzer.ts`
- `strategy-extractor.ts`
- `warning-extractor.ts`
- `storage-gate.ts`
- `node-normalizer.ts`

### Step 4
- `candidate-retriever.ts`
- `node-ranker.ts`
- `injection-renderer.ts`
- `intervention-controller.ts`

### Step 5
- `feedback-manager.ts`
- `harm-detector.ts`
- `state-transition.ts`
- `stats-updater.ts`

### Step 6
- OpenClaw plugin entry
- hook handlers
- CLI 命令

### Step 7
- 单元测试
- 集成测试
- 实验脚本

---

## 20. coding agent 的实现约束

coding agent 在写代码时，必须遵守以下约束：

1. **不要越权实现 ContextEngine 能力**
2. **不要把 hook handler 写成业务逻辑中心**
3. **所有模块都必须通过显式类型传递数据**
4. **所有写库动作必须通过 repository 层**
5. **所有高开销动作尽量放在任务结束后**
6. **默认以保守介入为主，skip 是合法且重要的结果**
7. **Actionable Form 不是默认展开，而是条件性展开**

---

## 21. 最终结论

这份 Engineering Blueprint 的目标不是把所有细节提前僵化，而是确保：

> **coding agent 拿到文档后，不会再问“从哪里开始写”，也不会因为边界不清而误把 ExperienceEngine 做成另一个 ContextEngine。**

只要按本文档的目录、模块、接口和顺序推进，就已经足够落地一个可实验的 ExperienceEngine v2 MVP。
