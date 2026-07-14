# ExperienceEngine 当前项目架构蓝图

> 文档性质：当前架构蓝图  
> 文档目的：说明 ExperienceEngine 现有代码架构、核心数据模型、模块关系和运行流程。  
> 不包含内容：本文件不写架构优化建议、不写未来改造方向、不评价当前设计优劣。  
> 适用场景：后续如果要优化 ExperienceEngine，可以先读这份蓝图，理解现有系统如何组成、模块之间如何连接、数据如何流动。
> 维护规则：任何架构修改、模块边界调整、核心流程变化或宿主行为变化，都必须同步更新本蓝图，使它始终描述当前真实架构。

---

## 0. 文档版本与状态

| 字段 | 当前值 |
| --- | --- |
| 最近同步日期 | 2026-07-14 |
| 最近同步范围 | `v0.5.0` 发布候选当前架构：OpenClaw package-local supervisor/worker、canonical home/package identity、SQLite migration authority、process fencing、immutable configuration/route authority、fenced semantic queue、production activation、published-artifact closure validation，以及既有 host trace/runtime service 边界 |
| 当前宿主基线 | OpenClaw、Claude Code、Codex、Antigravity |
| 发布基线 | 当前仓库版本已准备为 `v0.5.0` 发布候选，但尚未发布、打 tag 或完成 npm/ClawHub published-artifact 验证；公开渠道基线仍是 `v0.4.8` |
| Antigravity 状态 | 已记录用户级全局插件/MCP wiring、Agent Desktop、`agy` CLI、IDE hooks 观测、项目级 fallback 与 `ee agy exec -C <project>` 包装器 |
| TraceCapsule 状态 | 已落地为 runtime trace 输入模型和诊断快照模型；normal mode 只持久化 `trace_provenance_json` / `trace_completeness` 摘要，不写 full trace capsule/events；诊断快照需显式开启并命中 host/scope allowlist |
| 更新原则 | 记录当前真实架构；进行中的实现只在代码落地并验证后同步到正文架构图 |

维护提示：

- 每次宿主适配、核心数据模型、SQLite 表、runtime flow、operator surface 发生变化时，先更新本段状态，再更新对应正文段落。
- 如果有 OpenSpec 已创建但实现尚未完成，应在本段记录状态，不应把它混入“当前整体架构图”。

---

## 1. 项目当前定位

ExperienceEngine 当前定位为：

```text
面向 coding agent 的 execution experience governance layer。
```

它处理的核心对象不是普通记忆，而是：

```text
从真实 coding task 中沉淀出来的、可以在未来相似任务中复用的 execution guidance。
```

当前 README 中的主流程可以概括为：

```text
task signals -> distilled experience -> retrieval -> short intervention -> feedback -> governance
```

在代码层面，这条流程对应为：

```text
Host task
  -> Host adapter
  -> Host trace/provenance normalization
  -> Runtime input
  -> Task signal / Tool event
  -> Experience input record
  -> Candidate / Node
  -> Retrieval / Intervention
  -> Injection event
  -> Attribution / Review
  -> Node lifecycle update
```

`v0.4.2` 之后的 trace 边界是：

```text
Read wide. Distill carefully. Persist narrow.
```

也就是说，EE 会尽量读取各宿主可提供的 trace / tool / outcome 证据，用于归因和经验提炼；但普通学习路径不会把完整 trace 作为长期事实表持久化。长期存储的默认结果是提炼后的 experience、治理状态、任务摘要和最小 trace provenance。完整 trace capsule / event 只属于显式开启的诊断快照路径。

---

## 2. 当前顶层模块结构

当前代码可以按照职责分为以下模块层：

```text
src/
  adapters/              # 不同宿主的接入层，例如 OpenClaw / Claude Code / Codex / Antigravity
  analyzer/              # 任务信号分析、候选生成前的判断与归纳
  cli/                   # ee CLI 命令入口与命令分发
  config/                # 配置 schema、配置加载、路径解析
  controller/            # 检索、排序、注入决策、注入渲染
  distillation/          # candidate 到 node 的蒸馏与 provider 接入
  experience-management/ # 节点生命周期、repo policy、任务管理信号
  feedback/              # helped / harmed 反馈、归因、状态转换
  hybrid/                # hybrid review / postmortem 相关路径
  input/                 # HostPromptContext / ToolEvent 到 ExperienceInput 的转换
  install/               # host 安装、升级、修复相关逻辑
  interaction/           # inspect、feedback、operator read surface
  maintenance/           # hygiene、export drafts、维护任务
  mcp/                   # MCP 或 MCP 相关入口
  plugin/                # runtime capture、hooks、host payload 辅助
  runtime/               # 核心运行时服务
  store/                 # SQLite / vector store / repositories
  types/                 # 领域类型定义
  utils/                 # 通用工具函数
  version/               # 版本与远端 release 检查
```

Interaction surfaces are presented with a tier model:

- `routine`: host-first review and feedback, status, doctor, last-inspection, and helped/harmed fallback
- `operator`: install, upgrade, repair, operator review, hygiene review, export drafts, and managed state workflows
- `advanced`: maintenance commands, raw evaluations, broker internals, and developer diagnostics

Tier is separate from mutation risk. Operator review, hygiene, and export drafts are read-only operator workflows; install/upgrade/import/rollback are operator workflows with high-impact safeguards.

### Autonomous Hygiene Governance

Autonomous hygiene governance is a separate maintenance path from read-only hygiene inspection. Hygiene reports and operator review remain inspection surfaces; mutation happens only through the governance scheduler, planner, validator, applicator, and SQLite audit records. The approval service remains available for legacy queued approval records, but new autonomous experience-store governance uses guarded automatic execution.

Runtime hooks use host lifecycle events as wake signals, not as the source of truth for cadence:

```text
host startup / prompt lookup / posttask / stop
  -> maybeEnqueueGovernance(scope)
  -> persisted schedule + backoff + finding hash
  -> per-scope lease
  -> bounded drain
  -> planner
  -> deterministic validator
  -> safe or guarded apply
  -> action audit + rollback snapshot
```

The scheduler key is the canonical scope id. Host instance identity is only lease owner metadata, so frequent host open/close cycles and multiple supported hosts sharing the same ExperienceEngine home do not multiply governance frequency.

Core modules:

- `src/maintenance/hygiene-governance-scheduler.ts`: due checks, leases, bounded drain, backoff, keeper-compatible entrypoint
- `src/maintenance/hygiene-governance-planner.ts`: bounded input package, LLM strict JSON plan, deterministic fallback
- `src/maintenance/hygiene-governance-validator.ts`: deterministic safety checks for merge, retire, downgrade, quarantine, rewrite, scope, evidence, guarded high-impact experience-store execution, and non-store action rejection
- `src/maintenance/hygiene-governance-applicator.ts`: safe and guarded automatic application with snapshot/audit references
- `src/maintenance/hygiene-governance-approvals.ts`: legacy confirmation-token planning, approval execution/rejection, affected-row stale checks
- `src/store/sqlite/repositories/hygiene-governance-repo.ts`: schedule, lease, run, plan, action, approval, snapshot, and rollback persistence

High-impact experience-store actions are guarded automatic mutations, never direct LLM mutations: promotion lands in conservative delivery, delete-like cleanup is soft-retire/quarantine, and conflicted merges keep the canonical node out of direct live eligibility. Legacy approval tokens still bind scope, plan, action, affected row hashes, diff summary, and expiration for older queued approval records.

---

## 3. 当前整体架构图

```mermaid
flowchart TD
  User[User / Coding Task] --> Host[Host Agent<br/>OpenClaw / Claude Code / Codex / Antigravity]

  Host --> Adapter[Host Adapter Layer]
  Adapter --> Trace[Trace Normalization<br/>capability profile / provenance]
  Adapter --> RuntimePrompt[Prompt Runtime<br/>beforePromptBuild / lookup hints]
  RuntimePrompt --> PromptDecision[PromptDecisionPipeline<br/>fingerprint / candidates / policy / delivery]
  Adapter --> RuntimeTask[Task Runtime<br/>tool result / finalize task]
  Adapter --> Interaction[Interaction Surface<br/>inspect / feedback / status]

  PromptDecision --> InputAdapter[Input Adapter<br/>buildExperienceInput]
  RuntimeTask --> InputAdapter
  Trace --> RuntimeTask

  InputAdapter --> ExperienceInput[ExperienceInput]
  ExperienceInput --> RetrievalContext[RetrievalContext]

  RetrievalContext --> Retriever[Candidate Retriever]
  Retriever --> Intervention[Intervention Controller]
  Intervention --> Renderer[Injection Renderer]
  Renderer --> Adapter
  Adapter --> Host

  RuntimeTask --> InputRecord[ExperienceInputRecord]
  RuntimeTask --> TaskRun[TaskRun]
  RuntimeTask --> Outcome[OutcomeRecord]
  RuntimeTask --> TraceSummary[Trace Provenance Summary]
  RuntimeTask -. diagnostic only .-> TraceCapsule[Trace Capsule / Events]

  InputRecord --> LearningGate[Learning Gate / Analyzer]
  LearningGate --> Candidate[ExperienceCandidate]
  Candidate --> DistillationJob[DistillationJob]
  DistillationJob --> Node[ExperienceNode]

  Node --> Retriever

  Intervention --> InjectionEvent[InjectionEvent]
  Host --> Feedback[Feedback / Outcome]
  Feedback --> Attribution[AttributionRecord]
  Feedback --> Review[ReviewEvent]
  Attribution --> Governance[Lifecycle Governance]
  Review --> Governance
  Governance --> Node

  subgraph Storage[Storage Layer]
    SQLite[(SQLite)]
    Vector[(Vector / Embedding Store)]
  end

  InputRecord --> SQLite
  TaskRun --> SQLite
  Outcome --> SQLite
  TraceSummary --> SQLite
  TraceCapsule -. opt-in diagnostic snapshot .-> SQLite
  Candidate --> SQLite
  DistillationJob --> SQLite
  Node --> SQLite
  InjectionEvent --> SQLite
  Attribution --> SQLite
  Review --> SQLite
  Node --> Vector
```

Prompt-time decision ownership is shared through `src/runtime/prompt-decision-pipeline.ts`. The lightweight `ExperiencePromptRuntimeService` used by shared MCP paths such as Codex / Antigravity and the full `ExperienceRuntimeService` used by Claude Code / OpenClaw both delegate to this pipeline. The pipeline owns project fingerprint persistence, exact-scope and conservative cross-scope candidate loading, diagnostic and `shadow_probe` candidate loading, repo policy evaluation, delivery-mode suppression, scorecard creation, and `InjectionEvent` persistence.

Runtime trace capture is shared through `src/runtime/trace-capture-service.ts`. The full runtime delegates trace capture, host trace normalization, trace provenance summary creation, and opt-in diagnostic trace capsule persistence to this service. Normal mode still persists narrow trace provenance on input/task records and does not write full trace capsules/events unless diagnostic snapshot persistence is explicitly enabled and allowed by host/scope filters. Host-specific runtimes still decide when to call trace capture during prompt/tool/finalize lifecycle events.

Hybrid posttask review ownership is shared through `src/runtime/hybrid-postmortem-service.ts`. The full runtime delegates postmortem review capsule construction, hybrid worker invocation, provider-backed review fallback handling, hybrid invocation trace rows, accepted artifact persistence, and high-confidence injected-node review writeback to this service. `ExperienceRuntimeService` still decides when the posttask route escalates to async postmortem and remains the lifecycle coordinator around learning, finalize, and background task tracking.

Attribution writeback ownership is shared through `src/runtime/attribution-writeback-service.ts`. The full runtime delegates automatic attribution record persistence, trajectory expectation matching, trace evidence reference selection, record-only diagnostic attribution rows, and shadow-probe quarantine release/retire writeback to this service. `ExperienceRuntimeService` still resolves the injection event during finalize and remains responsible for earlier injected-node lifecycle feedback updates.

Injection outcome ownership is shared through `src/runtime/injection-outcome-service.ts`. The full runtime delegates injected-node automatic feedback updates, same-scope high-match promotion, cross-scope portable validation evidence, injection event resolution, harm observation, and downstream attribution writeback orchestration to this service. Finalize-time invocation order and transaction placement are coordinated by `FinalizeTaskCoordinator`.

Posttask route ownership is shared through `src/runtime/posttask-route-service.ts`. The full runtime delegates hybrid rollout resolution, posttask route signal construction, candidate-signal derivation, postmortem-already-recorded checks, and `decidePosttaskHybridRoute` evaluation to this service. `FinalizeTaskCoordinator` invokes posttask route resolution after the finalized run transaction and passes the result to background learning scheduling.

Background learning ownership is shared through `src/runtime/background-learning-runtime.ts`. The full runtime delegates pending background learning task tracking, candidate persistence scheduling, and async postmortem invocation after candidate persistence to this service. `ExperienceRuntimeService` still owns lazy worker construction and exposes `waitForBackgroundLearning()` as the host-facing compatibility entrypoint.

Hygiene governance ownership is shared through `src/runtime/hygiene-governance-runtime.ts`. The full runtime delegates autonomous hygiene governance scheduler creation, optional LLM planner resolution, enqueue/drain task tracking, and governance failure logging to this service. `ExperienceRuntimeService` still captures host-event trace context and exposes the host-facing `signalHostEvent()` and finalization wakeup points.

Host lifecycle ownership is shared through `src/runtime/host-lifecycle-runtime.ts`. The full runtime delegates prompt/host event session merge, prompt trace capture, prompt-time governance wakeup, and prompt decision pipeline invocation to this service. `ExperienceRuntimeService.signalHostEvent()` and `ExperienceRuntimeService.beforePromptBuild()` remain the host-facing compatibility entrypoints.

Tool-event recovery ownership is shared through `src/runtime/tool-event-recovery-runtime.ts`. The full runtime delegates tool event deduplication, tool-call-id keyed orphan result caching, and finalize-payload tool result recovery to this service. Host-facing persisted tool result handling is coordinated by `ToolResultRuntime`.

Tool result runtime ownership is shared through `src/runtime/tool-result-runtime.ts`. The full runtime delegates host tool result normalization, trace capture for persisted tool results, persisted result recovery writeback, and tool-result telemetry logging to this service. `ExperienceRuntimeService.persistToolResult()` remains the host-facing compatibility entrypoint but no longer owns the internal tool-result pipeline.

Runtime worker ownership is shared through `src/runtime/runtime-worker-factory.ts`. The full runtime delegates lazy construction and memoization of the LLM learning gate, distillation queue worker, and hybrid worker client to this factory. `ExperienceRuntimeService` still owns the callbacks passed into learning and hybrid services, but no longer owns dynamic worker imports or worker promise state.

Runtime session ownership is shared through `src/runtime/session-runtime.ts`. The full runtime delegates runtime session map ownership, session creation/reset, host context merge semantics, and stable episode id resolution to `RuntimeSessionStore` / `resolveSessionEpisodeId`. `ExperienceRuntimeService` still decides where host lifecycle events call into session state, but no longer owns the session map or session initialization shape directly.

Finalize task coordination is shared through `src/runtime/finalize-task-coordinator.ts`. The full runtime delegates finalized input construction, transaction-scoped task/input/outcome/stat persistence, trace persistence, injection outcome writeback, learning task context assembly, session reset, posttask route resolution, background learning scheduling, finalize logging, and posttask governance wakeup to this coordinator. `ExperienceRuntimeService` remains the host-facing entrypoint that resolves the session and delegates finalization.

---

## 4. Host Adapter Layer

### 4.1 模块位置

当前与宿主接入相关的代码主要分布在：

```text
src/adapters/
src/plugin/
src/cli/commands/*hook*.ts
src/cli/commands/mcp-server.ts
```

Codex MCP server 入口位于：

```text
src/adapters/codex/mcp-server.ts
```

### 4.2 当前支持的宿主

```text
OpenClaw
Claude Code
Codex
Antigravity
```

当前宿主状态：

| 宿主 | 当前接入状态 | 主要入口 |
| --- | --- | --- |
| OpenClaw | 已支持宿主插件 / CLI / fallback 路径 | `src/plugin/openclaw-plugin.ts`, `src/install/openclaw-installer.ts` |
| Claude Code | 已支持 hooks + 共享 MCP server | `src/cli/commands/claude-hook.ts`, `src/adapters/claude-code/*` |
| Codex | 已支持 Codex-native hooks + 共享 MCP server + `ee codex exec` fallback | `src/cli/commands/codex-hook.ts`, `src/adapters/codex/*` |
| Antigravity | 已支持用户级插件/MCP wiring、Agent Desktop、`agy` CLI、IDE hooks 观测、项目级 fallback | `src/cli/commands/antigravity-hook.ts`, `src/install/antigravity*.ts`, `src/adapters/antigravity/*` |

当前发布/分发状态：

| 渠道 | 当前状态 |
| --- | --- |
| npm | 仓库记录的公开基线为 `@alan512/experienceengine@0.4.8`；`v0.5.0` 仅完成候选元数据，尚未发布或验证 |
| GitHub | 仓库记录的公开基线为 `v0.4.8`；尚未创建 `v0.5.0` tag 或 GitHub Release |
| ClawHub | 公开 `0.4.8` artifact 已知缺少当前 runtime closure；`v0.5.0` 尚未发布或执行独立 channel validation |

当前 trace capability 基线：

| 宿主 | trace 使用边界 |
| --- | --- |
| OpenClaw | 支持 tool / lifecycle 事件归一化；normal mode 写 provenance 摘要；诊断 allowlist 可写 `trace_capsules` / `trace_events` |
| Claude Code | 支持 hook/session 事件投影；normal mode 写 provenance 摘要，不依赖完整 transcript 持久化 |
| Codex | 支持 wrapper / hook / MCP 生命周期事件；normal mode 写 provenance 摘要，不写 full trace snapshot |
| Antigravity | 支持 Agent Desktop、`agy` CLI、IDE hooks 和 artifact-assisted analyzer；normal mode 写 provenance 摘要，诊断模式可保留快照 |

Antigravity 的当前路径不是单一项目级配置。默认安装走用户级 global wiring：

```text
~/.gemini/config/plugins/experienceengine
~/.gemini/antigravity-cli/plugins/experienceengine
~/.gemini/antigravity/mcp_config.json
~/.gemini/config/mcp_config.json
```

项目级 `.mcp.json` / `.agents/hooks.json` 仍作为 activation fallback 保留。

### 4.3 Adapter 层输入输出

Adapter 层接收宿主侧事件，并将其转换为 ExperienceEngine 内部结构。

常见输入包括：

```text
cwd
sessionId
user prompt
tool result
task finalization signal
feedback request
inspect request
```

转换后的核心内部对象包括：

```text
HostPromptContext
ToolEvent
CodexLookupArgs
CodexToolResultArgs
CodexFinalizeArgs
Antigravity hook payload
Shared MCP behavior-loop args
```

trace 相关的 adapter 输出包括：

```text
TraceEvent[]
HostTraceCapabilityProfile
TraceProvenanceSummary
optional diagnostic TraceCapsule
```

这些对象的持久化边界由 runtime 决定。adapter 负责尽量归一化宿主证据，runtime 负责决定 normal mode 只保留摘要，还是在诊断开关和 allowlist 命中时写入完整快照。

### 4.4 Codex MCP 暴露的核心工具

```text
experienceengine_lookup_hints
experienceengine_record_tool_result
experienceengine_finalize_task
experienceengine_feedback_last
experienceengine_explain_last_decision
experienceengine_get_capabilities
experienceengine_doctor
```

这些工具连接到：

```text
ExperiencePromptRuntimeService
ExperienceRuntimeService
ExperienceInteractionService
ExperienceOperationalService
```

### 4.5 Antigravity 当前接入边界

Antigravity adapter 当前覆盖三个宿主入口：

```text
Agent Desktop
agy CLI
Antigravity IDE
```

用户级 global wiring 是主路径，项目级 activation 是 fallback。安装与检测主要由以下模块负责：

```text
src/install/antigravity.ts
src/install/antigravity-global-wiring.ts
src/install/antigravity-project-wiring.ts
src/cli/commands/antigravity-hook.ts
src/cli/commands/agy-exec.ts
src/cli/commands/antigravity.ts
```

Antigravity hook 当前处理：

```text
PreInvocation  -> lookupHints / injectSteps
PreToolUse     -> allow
PostToolUse    -> recordToolResult
Stop           -> finalizeTask + finalize dedupe
```

Antigravity 还包含 artifact-assisted analyzer，用于解析 `task.md`、`walkthrough.md`、`implementation_plan.md` 等规划/验证文件，并与 runtime finalization telemetry 对齐。

---

## 5. Runtime Layer

Runtime 层是当前主流程的核心。

主要文件：

```text
src/runtime/prompt-service.ts
src/runtime/service.ts
```

### 5.1 ExperiencePromptRuntimeService

文件：

```text
src/runtime/prompt-service.ts
```

主要入口：

```text
beforePromptBuild(context: HostPromptContext)
```

当前职责：

```text
1. 维护 prompt-time session state
2. 合并 HostPromptContext
3. 构造 ExperienceInput
4. 构造 RetrievalContext
5. 根据 scope 查询可用 ExperienceNode
6. 读取 ScopeTaskStats
7. 读取或创建 RepoPolicy
8. 调用 decideIntervention
9. 计算 live / shadow / holdout delivery mode
10. 写入 InjectionEvent
11. 返回 text / notice / scorecard / injected_node_ids
```

### 5.2 beforePromptBuild 当前流程图

```mermaid
flowchart TD
  Context[HostPromptContext] --> Session[Prompt Session State]
  Session --> Input[buildExperienceInput]
  Input --> RetrievalContext[buildRetrievalContext]
  Input --> Scope[resolveScope]

  Scope --> ScopeRepo[ScopeRepository]
  ScopeRepo --> Disabled{Scope disabled?}

  Disabled -->|yes| Skip[Return skip]
  Disabled -->|no| Nodes[Load candidate nodes]

  Nodes --> Stats[Load scope task stats]
  Stats --> RepoPolicy[Get / evaluate RepoPolicy]
  RepoPolicy --> Decision[decideIntervention]

  Decision --> Delivery[resolveDeliveryMode<br/>live / shadow / holdout]
  Delivery --> InjectionEvent[Persist InjectionEvent]
  InjectionEvent --> Result[Return guidance / notice / scorecard]
```

### 5.3 ExperienceRuntimeService

文件：

```text
src/runtime/service.ts
```

当前主要入口包括：

```text
recoverToolEvents(sessionId, payload)
persistToolResult(...)
finalizeTask(...)
waitForBackgroundLearning()
```

当前职责覆盖：

```text
1. 协调 host lifecycle entrypoints 与各 runtime 子服务
2. 委托 RuntimeSessionStore 维护 runtime session state
3. 委托 ToolEventRecoveryRuntime 处理工具事件去重、追加和 finalize payload 恢复
4. 委托 ToolResultRuntime 协调 persistToolResult 的 normalize、trace capture、tool recovery 和 telemetry
5. 委托 HostLifecycleRuntime 协调 signalHostEvent / beforePromptBuild 的 session merge、prompt trace capture、governance wakeup 和 prompt decision
6. 委托 FinalizeTaskCoordinator 协调 finalizeTask 的 transaction、trace、injection outcome、posttask route、background learning 和 governance wakeup
7. 委托 TaskFinalizationService 构造 finalized ExperienceInput 并写入 task/input/outcome/stats
8. 委托 TraceCaptureService 维护 runtime trace event buffer、trace provenance summary 和诊断快照持久化
9. 委托 InjectionOutcomeService 处理注入结果、反馈更新和归因写回
10. 委托 PosttaskRouteService 决定 posttask hybrid route
11. 委托 BackgroundLearningRuntime 调度 background learning task
12. 委托 HybridPostmortemService 处理 hybrid postmortem artifact 和 node review writeback
13. 委托 HygieneGovernanceRuntime 处理 autonomous hygiene governance wakeups
14. 委托 RuntimeWorkerFactory 懒加载 LlmLearningGate / DistillationQueueWorker / HybridWorkerClient
15. 维护 RuntimeCaptureWriter
```

### 5.4 Runtime session state

Runtime session state 由 `src/runtime/session-runtime.ts` 中的 `RuntimeSessionStore` 创建、缓存和 reset。`ExperienceRuntimeService` 只在 host lifecycle 入口处获取或合并 session context，并把 session 对象传给 trace、prompt decision、tool recovery、finalization 等子服务。

当前 runtime session state 包括：

```text
context?: HostPromptContext
episodeId?: string
toolEvents: ToolEvent[]
toolEventKeys: Set<string>
injectedNodeIds: string[]
lastInjectionEvent?: InjectionEvent
traceEvents?: TraceEvent[]
```

### 5.5 Host trace boundary

Runtime trace capture 和 trace persistence boundary 由 `src/runtime/trace-capture-service.ts` 处理。`ExperienceRuntimeService` 只在 prompt/tool/finalize 等 host lifecycle 入口处调用该服务。

核心规则：

```text
traceCaptureEnabled=true
  -> 允许运行时读取并归一化宿主 trace 证据
  -> 用于 attribution / distillation / learning gate
  -> normal mode 只持久化 trace_provenance_json、trace_completeness、trace_is_unstable 等摘要

tracePersistDiagnosticSnapshots=true + host/scope allowlist 命中
  -> 额外写入 trace_capsules、trace_events、trace_evidence_refs
  -> 受 traceRetentionDays、traceMaxEvents、traceMaxEvidenceRefs 限制
```

这条边界确保 EE 不是 raw agent trace recorder。完整 trace 是诊断资产；经验库的主数据仍然是 distilled experience 和治理元数据。

### 5.6 Finalize task coordination

`src/runtime/finalize-task-coordinator.ts` 负责维护 finalizeTask 的执行顺序：

```text
build finalized input
  -> transaction:
       persist input/task/outcome/stats
       persist trace summary / optional diagnostic snapshot
       finalize injection outcome and attribution writeback
       assemble PosttaskLearningContext
  -> reset RuntimeSessionStore session
  -> resolve posttask hybrid route
  -> schedule BackgroundLearningRuntime
  -> log finalize telemetry
  -> wake autonomous hygiene governance for posttask
```

该 coordinator 不直接做 candidate persistence、distillation 或 postmortem 写入；这些仍由 `BackgroundLearningRuntime`、`LearningPipelineService` 和 `HybridPostmortemService` 负责。

### 5.7 Tool result runtime

`src/runtime/tool-result-runtime.ts` 负责维护 persisted tool result 的执行顺序：

```text
normalize HostToolResult
  -> resolve RuntimeSessionState
  -> capture trace tool call/result events
  -> append or cache tool event recovery state
  -> write debug telemetry
  -> return normalized ToolEvent
```

全局或 orphan tool result 如果没有 prompt session context，会使用最小安全 trace context：`sessionId=global`、空 `userMessage`、未知 host。这样 trace capture 和 orphan recovery 都能继续工作，但不会伪造宿主上下文。

### 5.8 Host lifecycle runtime

`src/runtime/host-lifecycle-runtime.ts` 负责维护 host lifecycle 入口的 prompt-time 顺序：

```text
signalHostEvent(context, trigger)
  -> merge RuntimeSessionState context
  -> capture prompt trace for prompt_lookup / host_startup when message exists
  -> queue autonomous hygiene governance

beforePromptBuild(context)
  -> merge RuntimeSessionState context
  -> capture prompt trace event
  -> queue prompt_lookup governance wakeup
  -> delegate PromptDecisionPipeline.beforePromptBuild
```

该 runtime 不直接查询候选经验、不写 `InjectionEvent`，这些仍由 `PromptDecisionPipeline` 负责。它只维护 host lifecycle 的 session/trace/governance 调度边界。

### 5.9 OpenClaw package-local production runtime

OpenClaw 的后台学习运行时不复用宿主进程作为隐式 writer authority，而是由 package-local supervisor 和 worker 组成独立受控运行时。核心实现分布在：

```text
src/runtime/identity/
src/runtime/schema/
src/runtime/process/
src/runtime/configuration/
src/runtime/learning-queue/
src/runtime/activation/
src/runtime/package/
src/runtime/distribution/
```

当前执行链为：

```text
canonical home + package generation identity
  -> SQLite compatibility / migration authority
  -> launch authorization + supervisor/worker lease + fencing
  -> immutable configuration generation + validated route authority
  -> OpenClaw prepare / initialize / activation handshake
  -> production_write_authorized
  -> fenced semantic queue claim / renew / complete / recover
  -> terminal worker/supervisor authority release
```

关键边界：

- Gateway/plugin 只通过冻结的 control whitelist 改变 package activation authority。
- supervisor 是 migration、runtime route projection 和 worker lifecycle 的唯一协调者。
- worker 只有在当前 package/configuration/route/activation handshake 和 fencing authority 全部有效时，才能执行受保护的语义写入。
- authority 丢失只允许 interruption recovery，不能提交旧语义结果或消耗 content retry。
- `interaction_active`、`learning_runtime_active`、`production_learning_ready` 是三个独立投影；插件加载不等于后台学习已就绪。
- `artifact_runtime_validated` 需要 exact artifact 的 installed-artifact 与真实宿主证据；`support_claim_allowed` 还受 published channel、平台、repair/upgrade、文档和 S8 benchmark/quality gate 约束。
- 当前 WSL 与原生 Windows 的 local-pack real-host preflight 已通过，但 npm/ClawHub `v0.5.0` published-artifact 验证尚未发生，因此完整 production background learning 仍不能称为 supported。

---

## 6. Input / Signal Layer

该层负责把宿主上下文转换成 ExperienceEngine 领域输入。

主要文件：

```text
src/input/input-adapter.ts
src/input/tasktype-resolver.ts
src/input/outcome-resolver.ts
src/input/scope-resolver.ts
src/input/context-summary-adapter.ts
src/input/tool-event-significance.ts
src/analyzer/candidate-signals.ts
```

### 6.1 ExperienceInput

结构：

```text
ExperienceInput {
  scope_id
  task_type
  task_summary
  tool_events
  outcome_signal
  context_summary
  injected_node_ids
}
```

来源：

```text
HostPromptContext + ToolEvent[]
```

构造函数：

```text
buildExperienceInput(context, toolEvents)
```

### 6.2 ToolEvent

结构：

```text
ToolEvent {
  event_id
  tool_name
  input_summary?
  output_summary?
  status
  exit_code?
  error_signature?
  started_at
  ended_at?
}
```

### 6.3 CandidateSourceSignal

由 analyzer 层从 ExperienceInput 中构造，字段包括：

```text
task_summary
context_summary
outcome_signal
tool_events
evidence
failure_signature
retry_count
correction_signals
directional_correction
evidence_driven_reversal
tool_event_summary
trace_capsule_id?
trace_completeness?
trace_provenance?
```

相关生成逻辑：

```text
src/analyzer/candidate-signals.ts
```

---

## 7. Learning Layer

Learning Layer 负责从 finalized task 中生成 candidate，并通过 distillation 形成 node。

主要文件：

```text
src/analyzer/llm-learning-gate.ts
src/analyzer/candidate-signals.ts
src/analyzer/experience-analyzer.ts
src/analyzer/node-deduper.ts
src/analyzer/node-normalizer.ts
src/distillation/queue-worker.ts
src/distillation/*
```

### 7.1 Learning 数据流

```mermaid
flowchart TD
  FinalizedInput[Finalized ExperienceInput] --> CandidateSignals[buildCandidateSignals]
  CandidateSignals --> LearningGate[LlmLearningGate / Rule Gate]
  LearningGate --> GateResult{worth capturing?}

  GateResult -->|false| NoCandidate[No candidate created]
  GateResult -->|true| Draft[ExperienceCandidateDraft]

  Draft --> Normalize[normalizeCandidate]
  Normalize --> Dedupe[dedupeCandidates]
  Dedupe --> Candidate[ExperienceCandidate]
  Candidate --> Job[DistillationJob]
  Job --> Worker[DistillationQueueWorker]
  Worker --> Node[ExperienceNode]
```

### 7.2 ExperienceCandidate

结构来自：

```text
ExperienceCandidateDraft + runtime source metadata
```

主要字段包括：

```text
id
task_run_id
candidate_kind
source_record_id
source_context_summary
source_outcome_signal
raw_summary
failure_signature
source_signal
lifecycle_state
retry_count
distilled_node_id
last_error
created_at
updated_at
distilled_at
discarded_at
last_failed_at
```

候选生命周期：

```text
pending
distilled
failed
discarded
```

### 7.3 DistillationJob

主要字段：

```text
id
candidate_id
status
extractor_profile
distillation_source
failure_bucket
retry_count
last_error
created_at
updated_at
started_at
finished_at
discarded_at
```

Job 状态：

```text
pending
processing
succeeded
failed
discarded
```

---

## 8. Experience Node Layer

ExperienceNode 是当前系统中被检索、注入和治理的核心经验单元。

定义位置：

```text
src/types/domain.ts
```

存储表：

```text
experience_nodes
```

### 8.1 ExperienceNode 结构

#### 身份与分类

```text
id
node_type
scope_id
task_type
experience_kind
source_kind
```

#### 匹配与适用条件

```text
trigger_pattern
applicability_notes
env_signature
retrieval_text
embedding
embedding_provider
embedding_model
embedding_version
embedding_dimensions
```

#### 注入内容

```text
compact_hint
goal
recommended_steps
avoid_steps
fallback_steps
success_signal
stop_condition
escalation_condition
evidence_summary
```

#### correction / expectation correction 字段

```text
confidence_signal
validation_state
correction_scope
correction_category
deviation_pattern
corrected_constraint
```

#### distillation / merge 信息

```text
distillation_mode_used
distillation_source
redistilled_from
promotion_signal
promotion_reason
merge_decision
merge_reason
priority_promotion_applied
```

#### 治理状态

```text
state
delivery_state
usage_count
helped_count
harmed_count
consecutive_harmed_count
last_feedback_verdict
support_count
last_used_at
last_helped_at
last_harmed_at
quarantined_at
quarantine_reason
```

#### 来源记录

```text
origin_record_ids
helped_record_ids
harmed_record_ids
```

### 8.2 Node state

当前状态类型：

```text
candidate
priority_candidate
active
cooling
retired
```

### 8.3 Delivery state

当前投放状态类型：

```text
shadow_only
conservative_only
eligible
quarantined
```

### 8.4 Node 与其他对象关系

```mermaid
flowchart TD
  InputRecord[ExperienceInputRecord] --> Candidate[ExperienceCandidate]
  Candidate --> DistillationJob[DistillationJob]
  DistillationJob --> Node[ExperienceNode]

  Node --> Retrieval[CandidateRetriever]
  Retrieval --> Injection[InjectionEvent]

  Injection --> Attribution[AttributionRecord]
  Node --> Attribution

  Node --> Review[ReviewEvent]
  Review --> Lifecycle[Lifecycle Governance]
  Attribution --> Lifecycle
  Lifecycle --> Node
```

---

## 9. Retrieval / Intervention Layer

该层负责查找节点、评分、排序、决策和渲染注入内容。

主要文件：

```text
src/controller/retrieval-context.ts
src/controller/candidate-retriever.ts
src/controller/lexical-retriever.ts
src/controller/policy-enricher.ts
src/controller/model-reranker.ts
src/controller/model-reranker-mode.ts
src/controller/node-ranker.ts
src/controller/trigger-evaluator.ts
src/controller/intervention-controller.ts
src/controller/injection-renderer.ts
src/controller/injection-scorecard.ts
src/controller/inline-notice.ts
```

### 9.1 RetrievalContext

字段：

```text
scopeId
host
taskType
taskSummary
contextSummary
toolNames
failureSignature
outcomeSignal
injectedNodeIds
isReadOnly
modulePaths
expectationCorrectionIntent
```

### 9.2 CandidateRetriever 当前流程

```mermaid
flowchart TD
  Input[ExperienceInput] --> Query[buildRetrievalQuery]
  Query --> HardFilter[hardFilterNodes]
  HardFilter --> Lexical[computeLexicalRetrievalScores]
  Lexical --> Shortlist[Lexical Shortlist]
  Shortlist --> SemanticMode{semantic mode}
  SemanticMode -->|skipped| Policy
  SemanticMode -->|rerank| SemanticRerank[Semantic Rerank]
  SemanticMode -->|backfill| SemanticBackfill[Semantic Backfill]
  SemanticRerank --> Fusion[Score Fusion]
  SemanticBackfill --> Fusion
  Fusion --> Policy[Policy Enrichment]
  Policy --> MatchScorecard[buildMatchScorecard]
  MatchScorecard --> Rerank[Heuristic / Model Rerank]
  Rerank --> Ranked[RetrievedCandidate[]]
```

### 9.3 RetrievedCandidate

当前候选检索结果包含：

```text
node
semanticScore
lexicalScore
fusedScore
retrievalScore
retrievalReasons
policyAdjustment
policyScore
policyReasons
policyComponents
rerankScore
rerankSource
familyScore
matchScorecard
totalScore
scopeMatch
taskFamilyMatch
scoreMargin
```

### 9.4 InterventionController

主要文件：

```text
src/controller/intervention-controller.ts
```

输入：

```text
ExperienceInput
ExperienceNode[]
ScopeTaskStats
triggerThreshold
maxHints
ExperienceEngineConfig
RetrievalContext
RepoPolicy
```

输出：

```text
InterventionDecision {
  mode
  selected
  text
  diagnostics
}
```

mode 类型：

```text
skip
inject_conservative
inject
```

---

## 10. Injection Event / Scorecard Layer

### 10.1 InjectionEvent

存储表：

```text
injection_events
```

字段：

```text
injection_id
episode_id
session_id
scope_id
task_type
task_summary
mode
delivery_mode
delivered
injected_node_ids
injection_count
scorecard
was_successful
harm_observed
attribution_reason
created_at
resolved_at
```

### 10.2 InjectionScorecard

Scorecard 中包含：

```text
sessionId
scopeId
taskType
taskSummary
mode
interventionStrength
riskLevel
recommendation
reasons
topCandidates
topCandidateScore
scoreMargin
fastPathApplied
queryRewriteApplied
mergeDecision
promotionSignal
gateReason
decisionReason
confidence
budgetClass
secondOpinionApplied
selectedCandidateIds
recordOnlyDiagnosticCandidateIds
rejectedCandidates
nodes
createdAt
```

### 10.3 Scorecard 关系图

```mermaid
flowchart TD
  InterventionDecision --> Scorecard[InjectionScorecard]
  Scorecard --> TopCandidates[Top Candidates]
  Scorecard --> Selected[Selected Candidate IDs]
  Scorecard --> Rejected[Rejected Candidates]
  Scorecard --> GateReason[Gate Reason]
  Scorecard --> DecisionReason[Decision Reason]
  Scorecard --> Confidence[Confidence / Budget Class]
  Scorecard --> Nodes[Scorecard Nodes]
  Scorecard --> InjectionEvent[InjectionEvent]
```

---

## 11. Feedback / Attribution / Governance Layer

该层负责记录注入后的效果，并更新 ExperienceNode 状态。

主要文件：

```text
src/feedback/feedback-manager.ts
src/feedback/automatic-attribution.ts
src/feedback/harm-detector.ts
src/feedback/state-transition.ts
src/feedback/stats-updater.ts
src/experience-management/node-lifecycle-governance.ts
src/experience-management/repo-policy.ts
```

### 11.1 ReviewEvent

存储表：

```text
review_events
```

event_type 包括：

```text
mark_helped
mark_harmed
mark_uncertain
cool
retire
quarantine
restore_conservative
restore_eligible
promote_eligible
```

source：

```text
automatic
user
```

### 11.2 AttributionRecord

存储表：

```text
attribution_records
```

主要字段：

```text
id
injection_id
node_id
episode_id
intervention_strength
injection_mode
delivery_mode
delivered
outcome
attribution_verdict
confidence
evidence_refs
user_override
source
attribution_reason
created_at
resolved_at
```

AttributionVerdict 类型：

```text
strong_helped
weak_helped
neutral
unknown
weak_harmed
strong_harmed
```

### 11.3 Node lifecycle governance

主要文件：

```text
src/experience-management/node-lifecycle-governance.ts
src/feedback/state-transition.ts
```

治理会更新：

```text
state
delivery_state
helped_count
harmed_count
consecutive_harmed_count
last_feedback_verdict
last_helped_at
last_harmed_at
quarantined_at
quarantine_reason
```

---

## 12. Storage Layer

当前主要持久化使用 SQLite。

Schema 文件：

```text
src/store/sqlite/schema.sql
```

Repository 文件位于：

```text
src/store/sqlite/repositories/
```

Vector / embedding 相关代码位于：

```text
src/store/vector/
```

### 12.1 SQLite 表清单

```text
scopes
experience_input_records
task_runs
outcome_records
review_events
hybrid_review_artifacts
hybrid_invocation_traces
experience_nodes
experience_candidates
distillation_jobs
injection_events
attribution_records
repo_policies
scope_task_stats
scope_fingerprints
trace_capsules
trace_events
trace_evidence_refs
host_capability_probes
hygiene_governance_schedules
hygiene_governance_runs
hygiene_governance_plans
hygiene_governance_actions
hygiene_governance_approvals
hygiene_governance_snapshots
```

trace 表存在于 schema 中，但它们不是 normal learning 的必写表：

```text
experience_input_records.trace_provenance_json
task_runs.trace_provenance_json
experience_input_records.trace_completeness
task_runs.trace_completeness
```

是 normal mode 的长期 provenance 摘要；`trace_capsules`、`trace_events`、`trace_evidence_refs` 只在诊断快照模式或 legacy 数据读取时使用。

### 12.2 表关系图

```mermaid
erDiagram
  SCOPES ||--o{ EXPERIENCE_INPUT_RECORDS : has
  SCOPES ||--o{ TASK_RUNS : has
  SCOPES ||--o{ EXPERIENCE_NODES : has
  SCOPES ||--o{ EXPERIENCE_CANDIDATES : has
  SCOPES ||--o{ INJECTION_EVENTS : has
  SCOPES ||--o{ REPO_POLICIES : has
  SCOPES ||--o{ SCOPE_TASK_STATS : has
  SCOPES ||--o{ HYBRID_REVIEW_ARTIFACTS : has
  SCOPES ||--o{ HYBRID_INVOCATION_TRACES : has
  SCOPES ||--o{ TRACE_CAPSULES : diagnostic_trace_for
  SCOPES ||--o{ HYGIENE_GOVERNANCE_RUNS : governs

  EXPERIENCE_INPUT_RECORDS ||--o{ EXPERIENCE_CANDIDATES : source_for
  EXPERIENCE_INPUT_RECORDS ||--o| TRACE_CAPSULES : optional_diagnostic_link
  EXPERIENCE_CANDIDATES ||--o{ DISTILLATION_JOBS : has

  TASK_RUNS ||--o{ OUTCOME_RECORDS : has
  TASK_RUNS ||--o{ REVIEW_EVENTS : has
  TASK_RUNS ||--o{ HYBRID_REVIEW_ARTIFACTS : has
  TASK_RUNS ||--o| TRACE_CAPSULES : optional_diagnostic_link

  EXPERIENCE_NODES ||--o{ REVIEW_EVENTS : reviewed_by
  EXPERIENCE_NODES ||--o{ ATTRIBUTION_RECORDS : attributed_by

  INJECTION_EVENTS ||--o{ ATTRIBUTION_RECORDS : resolved_by
  TRACE_CAPSULES ||--o{ TRACE_EVENTS : contains
  TRACE_CAPSULES ||--o{ TRACE_EVIDENCE_REFS : references
```

---

## 13. Interaction / Operator Layer

该层用于查看状态、解释决策、反馈上一条注入、查看 review / hygiene / export drafts 等。

主要文件：

```text
src/interaction/service.ts
src/interaction/operational-service.ts
src/interaction/operational-actions-service.ts
src/interaction/state-artifact-service.ts
src/adapters/codex/mcp-server.ts
src/cli/dispatch.ts
src/cli/commands/*
```

### 13.1 InteractionService 常见能力

Codex MCP surface 中使用了这些交互能力：

```text
inspectLast
inspectRecent
listActiveNodes
inspectNode
listNodesByState
listNodesByType
inspectLearningSummary
inspectRepoSummary
inspectReview
inspectHygiene
inspectExportDrafts
inspectTrace
explainLastDecision
feedbackLast
feedbackNode
disableScope
enableScope
coolNode
retireNode
```

### 13.2 CLI command dispatch

CLI 入口：

```text
src/cli/index.ts
src/cli/dispatch.ts
```

命令分发包括：

```text
install
backup
claude-hook
codex-hook
antigravity-hook
codex
agy
antigravity
codex-mcp-server
mcp-server
doctor
evaluate
config
models
init
repair
status
export
import
rollback
upgrade
stats
feedback
helped
harmed
inspect
maintenance
disable
enable
cool
retire
```

trace inspection 的当前边界：

```text
ee inspect --last --verbose
  -> 展示 trace summary / completeness / provenance / full snapshot 是否保留

ee inspect --trace <capsule-id>
  -> 仅在 diagnostic snapshot 或 legacy trace capsule 存在时可用
```

因此 operator 默认看到的是 distilled/summary 视图；完整 trace 只作为显式诊断入口暴露。

---

## 14. Hybrid Layer

Hybrid 相关结构在当前代码中独立存在。

主要涉及：

```text
src/hybrid/
hybrid_review_artifacts
hybrid_invocation_traces
HybridWorkerClient
HybridReviewArtifactRepository
HybridInvocationTraceRepository
```

当前 runtime 中会处理：

```text
hybrid rollout
async postmortem
hybrid review artifact
postmortem node review
delivery recommendation
```

相关配置项位于：

```text
src/config/config-schema.ts
```

包括：

```text
hybridEnabled
hybridSyncExplainEnabled
hybridAsyncPostmortemEnabled
hybridRolloutMode
hybridCanaryRate
hybridKillSwitch
hybridRoutePolicyVersion
hybridCapsuleSchemaVersion
hybridExplainDecisionProfileVersion
hybridPostmortemReviewProfileVersion
hybridExplainLlmEnabled
hybridAsyncPostmortemLlmEnabled
```

---

## 15. 当前主流程时序图

### 15.1 Task start / lookup hints

```mermaid
sequenceDiagram
  participant User
  participant Host as Host Agent
  participant Adapter as Host Adapter / MCP
  participant Prompt as ExperiencePromptRuntimeService
  participant Store as SQLite
  participant Retriever as CandidateRetriever
  participant Controller as InterventionController

  User->>Host: coding task prompt
  Host->>Adapter: lookup_hints(prompt, cwd, sessionId)
  Adapter->>Prompt: beforePromptBuild(context)
  Prompt->>Prompt: buildExperienceInput
  Prompt->>Store: load scope / nodes / stats / repo policy
  Prompt->>Retriever: retrieveCandidateBundle
  Retriever-->>Prompt: RetrievedCandidate[]
  Prompt->>Controller: decideIntervention
  Controller-->>Prompt: InterventionDecision
  Prompt->>Store: upsert InjectionEvent
  Prompt-->>Adapter: text / notice / scorecard
  Adapter-->>Host: guidance or skip result
```

### 15.2 Tool result recording

```mermaid
sequenceDiagram
  participant Host
  participant Adapter
  participant Runtime as ExperienceRuntimeService
  participant Session as Runtime Session State

  Host->>Adapter: tool result payload
  Adapter->>Runtime: recordToolResult / recoverToolEvents
  Runtime->>Runtime: normalizeToolResult
  Runtime->>Session: append ToolEvent with dedupe key
  Runtime-->>Adapter: recorded
```

### 15.3 Task finalization / learning

```mermaid
sequenceDiagram
  participant Host
  participant Adapter
  participant Runtime as ExperienceRuntimeService
  participant Trace as Trace Capsule Boundary
  participant Store as SQLite
  participant Gate as LlmLearningGate
  participant Worker as DistillationQueueWorker

  Host->>Adapter: finalize_task(sessionId, prompt, contextSummary)
  Adapter->>Runtime: finalizeTask
  Runtime->>Runtime: buildFinalizedInput
  Runtime->>Trace: build trace profile / provenance
  Trace-->>Runtime: traced ExperienceInput / TaskRun / InputRecord
  Runtime->>Store: upsert scope
  Runtime->>Store: upsert ExperienceInputRecord
  Runtime->>Store: upsert TaskRun
  Runtime->>Store: upsert OutcomeRecord
  alt diagnostic snapshot enabled and allowlisted
    Runtime->>Store: upsert TraceCapsule / TraceEvents / EvidenceRefs
  else normal mode
    Runtime->>Store: persist trace summary only
  end
  Runtime->>Store: update ScopeTaskStats
  Runtime->>Gate: analyze finalized task
  Gate-->>Runtime: LearningGateResult
  alt worth capturing
    Runtime->>Store: upsert ExperienceCandidate
    Runtime->>Store: upsert DistillationJob
    Runtime->>Worker: drain / process job
    Worker->>Store: create or update ExperienceNode
  else not worth capturing
    Runtime->>Store: persist task-level learning status / reason
  end
  Runtime-->>Adapter: finalized result
```

### 15.4 Feedback / governance

```mermaid
sequenceDiagram
  participant User
  participant Host
  participant Adapter
  participant Interaction as InteractionService
  participant Store as SQLite
  participant Governance as Lifecycle Governance

  User->>Host: helped / harmed feedback
  Host->>Adapter: feedback_last
  Adapter->>Interaction: feedbackLast
  Interaction->>Store: find last injection / nodes
  Interaction->>Governance: apply feedback
  Governance->>Store: update ExperienceNode
  Governance->>Store: write ReviewEvent
  Governance->>Store: write AttributionRecord
  Interaction-->>Adapter: feedback result
  Adapter-->>Host: updated
```

---

## 16. 当前对象关系总览

```mermaid
flowchart TD
  Scope[Scope] --> InputRecord[ExperienceInputRecord]
  Scope --> TaskRun[TaskRun]
  Scope --> Node[ExperienceNode]
  Scope --> Candidate[ExperienceCandidate]
  Scope --> RepoPolicy[RepoPolicy]
  Scope --> Stats[ScopeTaskStats]

  TaskRun --> Outcome[OutcomeRecord]
  TaskRun --> Review[ReviewEvent]
  TaskRun --> HybridArtifact[HybridReviewArtifact]

  InputRecord --> Candidate
  Candidate --> DistillationJob[DistillationJob]
  DistillationJob --> Node

  Node --> Injection[InjectionEvent]
  Injection --> Attribution[AttributionRecord]
  Node --> Attribution
  Node --> Review
```

---

## 17. 当前代码阅读顺序

如果只想理解现有架构，可以按以下顺序阅读：

```text
1. README.md
2. docs/development/experience-model.md
3. src/types/domain.ts
4. src/store/sqlite/schema.sql
5. src/adapters/codex/mcp-server.ts
6. src/adapters/shared-mcp/behavior-loop.ts
7. src/cli/commands/antigravity-hook.ts
8. src/install/antigravity.ts
9. src/install/antigravity-global-wiring.ts
10. src/adapters/trace-capabilities.ts
11. src/runtime/prompt-service.ts
12. src/runtime/service.ts
13. src/store/sqlite/repositories/trace-repo.ts
14. src/input/input-adapter.ts
15. src/analyzer/candidate-signals.ts
16. src/analyzer/llm-learning-gate.ts
17. src/controller/candidate-retriever.ts
18. src/controller/intervention-controller.ts
19. src/experience-management/node-lifecycle-governance.ts
20. src/feedback/state-transition.ts
21. src/interaction/service.ts
22. src/cli/dispatch.ts
```

---

## 18. 当前架构中的关键边界

### 18.1 Adapter 与 Runtime

```text
Adapter 负责宿主接入。
Runtime 负责 ExperienceEngine 内部任务流程。
```

### 18.2 Prompt Runtime 与 Task Runtime

```text
Prompt Runtime 负责任务开始前的经验检索与注入。
Task Runtime 负责工具事件记录、任务结束、学习与后处理。
```

### 18.3 Task Record 与 Experience Node

```text
Task Record 保存任务历史。
Experience Node 保存可检索、可注入、可治理的经验。
```

### 18.4 Candidate 与 Node

```text
ExperienceCandidate 是学习候选。
ExperienceNode 是最终进入检索与治理系统的经验节点。
```

### 18.5 Retrieval 与 Intervention

```text
Retrieval 负责找到相关节点。
Intervention 负责决定 skip / inject_conservative / inject。
```

### 18.6 Feedback 与 Governance

```text
Feedback / Attribution 记录一次干预的结果。
Governance 根据结果更新节点状态和投放状态。
```

---

## 19. 当前架构摘要

ExperienceEngine 当前架构可以压缩成下面这张图：

```mermaid
flowchart LR
  A[Host Agent] --> B[Adapter]
  B --> C[Runtime]
  C --> D[ExperienceInput]
  D --> E[Task Records]
  E --> F[Candidates]
  F --> G[Experience Nodes]
  G --> H[Retrieval]
  H --> I[Intervention]
  I --> A
  I --> J[Injection Events]
  A --> K[Feedback / Outcome]
  K --> L[Attribution / Review]
  L --> G
```

对应一句话：

```text
Host agent 产生任务与工具信号；
Adapter 和 Runtime 会尽量读取宿主 trace 证据，并在 normal mode 下只保留 provenance 摘要；
Runtime 将信号变成 ExperienceInput 和任务记录；
Learning pipeline 将部分任务记录变成 candidate 和 node；
Retrieval / Intervention 在后续任务中查找并注入 node；
Feedback / Governance 根据结果更新 node 的状态。
```
