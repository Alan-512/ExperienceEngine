# Host Trace Capsule Design

Status: internal design draft
Date: 2026-05-24

## Purpose

ExperienceEngine currently learns from a compact finalized task shape:

```text
HostPromptContext + ToolEvent[] -> ExperienceInput -> candidate signals -> learning gate
```

This is enough for many command, config, and verification-loop experiences, but it is weak for higher-value attribution questions:

- Did the host agent follow the injected guidance?
- What failed before the final fix?
- What exactly did the user correct?
- Did the agent change implementation layer, verification order, or task boundary?
- Which objective evidence proves the final outcome?

The goal of this design is to add a bounded, host-neutral trace layer that captures as much decision-grade execution evidence as each host can reliably provide, without turning ExperienceEngine into a raw transcript store or generic memory system.

## Design Thesis

ExperienceEngine should capture a best-effort `TraceCapsule` per meaningful turn or task. The capsule should be richer than `ExperienceInput`, but still bounded and evidence-oriented.

The core shape is:

```text
Host lifecycle events
  -> Host trace adapter
  -> normalized TraceCapsule
  -> projection into existing ExperienceInput
  -> existing learning, retrieval, attribution, and governance flow
```

`TraceCapsule` is an upstream evidence layer. It does not replace `ExperienceInput` in the first phase.

## Goals

- Capture task goal, explicit constraints, non-goals, verification evidence, corrections, file changes, user feedback, and final outcome evidence when available.
- Normalize Codex, Claude Code, Antigravity, and OpenClaw into one host-neutral trace contract.
- Preserve the existing `ExperienceInput` learning path as the stable runtime contract.
- Improve `expectation_correction`, warning, verification-loop, and adoption attribution quality.
- Track capture completeness so low-evidence tasks do not get over-promoted.
- Keep raw or unstable host transcript usage as best-effort enrichment, not as a product contract.

## Non-Goals

- Do not persist chain-of-thought or hidden model reasoning.
- Do not persist full raw transcripts as the primary EE data model.
- Do not require every host to support every trace event.
- Do not block host agent execution on heavy trace analysis.
- Do not migrate all historical `ExperienceInputRecord` rows into trace capsules.
- Do not hard-code host-specific assumptions in the learning gate.

## Current Baseline

Current durable runtime input is:

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

Current `ToolEvent` is:

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

This model is intentionally compact. It is good at representing terminal tool success/failure, but it compresses away data needed for stronger causal attribution:

- file paths and change surface
- user corrections
- explicit non-goals
- plan or strategy changes
- per-step verification meaning
- host-specific stop/failure reasons
- whether injected guidance was adopted or violated

## Proposed Model

### TraceCapsule

```ts
type TraceCapsule = {
  id: string;
  host: "codex" | "claude-code" | "antigravity" | "openclaw";
  sessionId: string;
  turnId?: string;
  scopeId: string;
  cwd?: string;
  startedAt: string;
  endedAt?: string;

  task: TraceTask;
  events: TraceEvent[];
  evidenceRefs: EvidenceRef[];
  outcome: TraceOutcome;
  capture: TraceCaptureMetadata;
};
```

### TraceTask

```ts
type TraceTask = {
  userGoal: string;
  userConstraints: string[];
  userNonGoals: string[];
  acceptanceSignals: string[];
  injectedExpectations: TraceInjectedExpectation[];
  deliveredNodeIds: string[];
  injectionMode?: "skip" | "inject_conservative" | "inject";
  deliveryMode?: string;
};
```

Notes:

- `userGoal` comes from prompt or message payload.
- `userConstraints` and `userNonGoals` come only from user-origin text: prompts, user corrections, user-visible review comments, or explicit manual feedback.
- `injectedExpectations` and `deliveredNodeIds` represent ExperienceEngine-origin expectations. They must not be mixed into user-origin fields.
- User-origin fields should be conservative. Empty arrays are better than speculative constraints.
- EE-origin expectations are used for adoption and harm attribution, not as proof that the user requested the same constraint.

```ts
type TraceInjectedExpectation = {
  nodeId: string;
  expectation: string;
  expectedEvidenceKinds: Array<"tool" | "file_change" | "verification" | "avoidance" | "final_message">;
  deliveryState?: string;
};
```

### TraceEvent

```ts
type TraceEvent =
  | UserPromptEvent
  | PlanEvent
  | ToolCallEvent
  | ToolResultEvent
  | FileChangeEvent
  | VerificationEvent
  | FailureEvent
  | CorrectionEvent
  | UserFeedbackEvent
  | SubagentEvent
  | FinalMessageEvent;
```

All trace events share:

```ts
type TraceEventBase = {
  id: string;
  capsuleId: string;
  eventIndex: number;
  eventType: string;
  source: TraceEventSource;
  timestamp: string;
  confidence: "low" | "medium" | "high";
  evidenceRefIds: string[];
};
```

`eventIndex` should preserve host order when possible. If the host provides only partial ordering, the adapter should mark confidence lower.

`TraceEventSource` is a small provenance envelope, not a raw host payload:

```ts
type TraceEventSource = {
  host: TraceCapsule["host"];
  hostEventName?: string;
  capabilityName: string;
  sourceKind: "hook_payload" | "plugin_api" | "mcp_tool" | "transcript_enrichment" | "artifact" | "derived";
  provenance: "verified" | "documented" | "inferred" | "disabled";
  unstable: boolean;
};
```

`TraceEvent` payloads should store normalized fields only. Raw host payloads should be summarized through `EvidenceRef` and hashed when large. `payload_json` in storage is for normalized event-specific fields, not a place to dump host-specific JSON.

### Admissible Content Boundary

Trace capture may summarize:

- user-visible user prompts and follow-up instructions
- user-visible assistant messages, plans, and final summaries
- host hook payload fields documented for external hooks
- tool inputs and tool outputs exposed through host lifecycle events
- plugin API events documented for host integration
- artifacts or transcript excerpts that are user-visible or tool-visible

Trace capture must not read or persist:

- hidden chain-of-thought
- provider reasoning fields
- internal model traces
- non-user-visible deliberation streams
- raw transcript fields whose visibility or stability cannot be established

`PlanEvent` is allowed only for user-visible plans or explicit plan artifacts. It must never represent hidden reasoning.

### CorrectionEvent

`CorrectionEvent` is the highest-value addition for learning quality:

```ts
type CorrectionEvent = TraceEventBase & {
  eventType: "correction";
  before?: string;
  after?: string;
  correctionSource: "user" | "tool_failure" | "verification" | "agent_pivot";
  category:
    | "goal_interpretation"
    | "implementation_boundary"
    | "verification_order"
    | "quality_bar"
    | "interaction_behavior"
    | "style_constraint";
};
```

Learning should treat correction events as high confidence only when they have at least one evidence ref and a clear before/after boundary.

### VerificationEvent

```ts
type VerificationEvent = TraceEventBase & {
  eventType: "verification";
  verifier: "test" | "typecheck" | "lint" | "doctor" | "browser" | "smoke" | "manual" | "other";
  commandOrTool?: string;
  result: "passed" | "failed" | "unknown";
  proves?: string;
};
```

`proves` should be a concise claim, such as:

```text
pnpm test passed after moving the fix from UI state to provider routing.
```

### FileChangeEvent

```ts
type FileChangeEvent = TraceEventBase & {
  eventType: "file_change";
  path: string;
  action: "created" | "modified" | "deleted" | "renamed" | "unknown";
  surface:
    | "source"
    | "test"
    | "docs"
    | "config"
    | "style"
    | "generated"
    | "asset"
    | "unknown";
  summary?: string;
};
```

This enables better implementation-boundary corrections, for example:

```text
UI polish request modified JS behavior instead of only CSS.
```

### TraceOutcome

```ts
type TraceOutcome = {
  signal: "success" | "failure" | "partial" | "cancelled" | "unknown";
  source:
    | "tool_result"
    | "stop_message"
    | "user_feedback"
    | "verification"
    | "manual_override";
  confidence: "low" | "medium" | "high";
  evidenceRefIds: string[];
};
```

Projection to existing `OutcomeSignal`:

```text
success -> success
failure -> failure
partial -> unknown
cancelled -> unknown
unknown -> unknown
```

`partial` should remain distinct inside trace data even though the current learning model cannot fully express it.

### EvidenceRef

```ts
type EvidenceRef = {
  id: string;
  capsuleId: string;
  kind:
    | "hook_payload"
    | "tool_input"
    | "tool_output"
    | "transcript_excerpt"
    | "artifact"
    | "file_diff"
    | "command_output"
    | "user_message"
    | "final_message";
  source: string;
  locator?: string;
  summary: string;
  hash?: string;
  redactionState: "not_needed" | "redacted" | "unknown";
  unstableSource: boolean;
};
```

Large payloads should be summarized and hashed. The raw data should not be copied into the capsule unless it is already small, relevant, and safe.

### Capture Metadata

```ts
type TraceCaptureMetadata = {
  capabilityProfileId: string;
  completeness: "low" | "medium" | "high";
  unstableSourcesUsed: boolean;
  redactionApplied: boolean;
  missingCapabilities: string[];
  hostRuntimeMode?: string;
  projectFingerprint?: string;
  environmentFingerprint?: string;
};
```

The learning gate should use `completeness` and `unstableSourcesUsed` when deciding whether to promote a candidate.

Fingerprints must be coarse and non-secret. They should help portability and debugging, not identify private machine state. Examples include host runtime target, adapter name/version, repo scope id, and broad platform family. Do not store raw environment variables.

## Host Capability Profiles

Each host adapter should declare a capability profile instead of making the learning layer infer host behavior.

```ts
type HostTraceCapabilityProfile = {
  id: string;
  host: TraceCapsule["host"];
  profileVersion: string;
  adapterVersion: string;
  observedAt?: string;
  source: "doctor_probe" | "official_docs" | "adapter_static" | "operator_override";
  capabilities: HostTraceCapability[];
  transcriptStability: "stable" | "unstable" | "unavailable";
  toolCoverage: "complete" | "partial" | "host_specific";
};

type HostTraceCapability = {
  name: string;
  state: "stable" | "best_effort" | "unsupported" | "disabled";
  provenance: "verified" | "documented" | "inferred" | "disabled";
  verifiedAt?: string;
  notes?: string;
};
```

Capability profiles must be versioned and observable. Static adapter declarations are only defaults. `ee doctor <host> --trace-capabilities` and host validation probes should be treated as the authoritative source when available, especially for Codex and Antigravity where official support and runtime behavior can diverge.

### Claude Code

Expected quality: high.

Stable official surfaces include:

- `UserPromptSubmit`
- `PreToolUse`
- `PostToolUse`
- `PostToolUseFailure`
- `PostToolBatch`
- `TaskCreated`
- `TaskCompleted`
- `Stop`
- `StopFailure`
- `FileChanged`
- `SessionStart`
- `SessionEnd`

Best use:

- Full trace capsule capture.
- High-quality failure and correction windows.
- File change events from first-class host events.
- Verification events from tool output and task completion checks.

Primary gaps:

- Visible plan and strategy still depend on transcript or model-visible text.
- Transcript should still be treated as enrichment rather than the only source.

### Codex

Expected quality: medium to high, depending on tool coverage.

Stable official surfaces include:

- `SessionStart`
- `UserPromptSubmit`
- `PreToolUse`
- `PermissionRequest`
- `PostToolUse`
- `SubagentStart`
- `SubagentStop`
- `PreCompact`
- `PostCompact`
- `Stop`

Codex `PostToolUse` can provide tool name, tool input, tool use id, and tool response for supported tools including Bash, `apply_patch`, and MCP tool calls.

Important boundary:

- Codex documentation says tool interception is incomplete for some shell paths and non-shell or non-MCP tools.
- `transcript_path` exists, but transcript format is not a stable hook interface.

Best use:

- Hook payload is primary source.
- Transcript is best-effort enrichment only.
- `apply_patch` and MCP calls should generate stronger file and tool events when present.

Primary gaps:

- Complete tool coverage cannot be assumed.
- Stop on unusual conditions may not always provide the same evidence quality.

### Antigravity

Expected quality: medium to high.

Stable official surfaces include:

- `PreInvocation`
- `PostInvocation`
- `PreToolUse`
- `PostToolUse`
- `Stop`

Useful fields:

- `conversationId`
- `workspacePaths`
- `transcriptPath`
- `artifactDirectoryPath`
- `stepIdx`
- `invocationNum`
- `initialNumSteps`
- `terminationReason`
- `fullyIdle`

Best use:

- Build a step-indexed trajectory.
- Use `PreToolUse` for tool call arguments.
- Use `PostToolUse` for error state and step boundary.
- Use transcript and artifact directory for best-effort enrichment.

Primary gaps:

- `PostToolUse` payload itself is thinner than Claude Code and Codex.
- Tool result details often require transcript or artifact reads.

### OpenClaw

Expected quality: host-specific.

Relevant surfaces include:

- command events such as `/new` and `/reset`
- session events
- message events
- session patch events
- plugin API tool result hooks such as `tool_result_persist`

Best use:

- Treat OpenClaw as gateway/session/message native.
- Use plugin-native events and tool result persistence points.
- Do not force it into the Claude/Codex hook shape.

Primary gaps:

- Generic coding-agent fine-grained tool loop is not represented the same way.
- File changes and verification evidence may depend on OpenClaw-specific tools or transcript structure.

## Normalization Strategy

Each host adapter should produce host-neutral `TraceEvent` objects.

Examples:

```text
Claude PostToolUseFailure
  -> ToolResultEvent(status=failure)
  -> FailureEvent(error_signature=...)

Codex PostToolUse(apply_patch)
  -> ToolResultEvent(status=success)
  -> FileChangeEvent(surface=source/test/docs/config/style when inferable)

Antigravity PreToolUse(stepIdx=7, toolCall=run_command)
  -> ToolCallEvent(eventIndex=7)

Antigravity PostToolUse(stepIdx=7, error="exit status 1")
  -> ToolResultEvent(status=failure)
  -> FailureEvent(error_signature="exit status 1")

OpenClaw tool_result_persist
  -> ToolResultEvent
```

Adapters should not directly create candidates. They only create trace data and projected runtime inputs.

## Projection Into ExperienceInput

Projection should be deterministic:

```text
TraceCapsule.task.userGoal
  -> ExperienceInput.task_summary

ToolResultEvent
  -> ExperienceInput.tool_events

TraceOutcome.signal
  -> ExperienceInput.outcome_signal

CorrectionEvent + VerificationEvent + FinalMessageEvent
  -> ExperienceInput.context_summary

TraceCapsule.task.deliveredNodeIds
  -> ExperienceInput.injected_node_ids
```

The projected `context_summary` should be concise and structured. Example:

```text
Correction: user rejected JS behavior changes for a UI polish task; agent reverted JS and kept CSS-only changes.
Verification: pnpm test passed after the CSS-only change.
Final: task completed with no behavior changes.
```

This gives the existing candidate-signal code better evidence without forcing it to parse raw transcript text.

Projection must preserve legacy behavior unless trace enrichment is explicitly enabled for learning. The projector should:

- resolve scope through the existing scope resolver
- resolve `task_type` through the existing task-type resolver
- call `buildExperienceInput(...)` with a host-neutral synthetic `HostPromptContext` and projected `ToolEvent[]`, or match its behavior through parity tests
- pass projected final context through the existing context summary adapter
- preserve existing `resolveOutcome(...)` behavior unless `TraceOutcome` has higher-confidence evidence
- dedupe tool events by host tool call id, normalized tool name, event index, and timestamp window
- avoid double-counting a `FailureEvent` as a second `ToolEvent` when it was derived from the same `ToolResultEvent`
- keep failure signatures deterministic and bounded

Projection parity tests should compare legacy hook payload projection with trace projection for representative Codex, Claude Code, Antigravity, and OpenClaw fixtures.

## Compatibility Contract

Trace capsules are optional enrichment. The shared EE experience library remains compatible across hosts and across old/new records by following these rules:

1. `ExperienceInput` remains the stable learning and retrieval contract.
2. Existing `ExperienceInputRecord` rows without a trace capsule remain valid and reusable.
3. Legacy records are treated as trace completeness `legacy` or `unknown`, not as invalid data.
4. Retrieval must not require trace data.
5. Trace-derived fields may improve learning confidence, attribution, ranking, and inspect explanations, but must not be mandatory for basic reuse.
6. Host-specific raw fields must not enter reusable `ExperienceNode` content unless normalized into host-neutral concepts.
7. Host-specific experiences must be explicitly marked through correction scope, applicability notes, or host-local metadata.
8. Cross-host experiences should distill from normalized events such as verification, file change, user correction, and tool family, not from host hook names.
9. Trace completeness and source provenance must travel with candidates so low-evidence or unstable-source candidates do not get promoted as high-confidence guidance.
10. New trace storage must be additive. No historical backfill is required for existing records.

## Learning Integration

### Candidate Signals

Extend source signal construction to include trace-derived windows:

```text
correction_window
verification_window
change_surface
adoption_window
trace_completeness
source_provenance
```

These should be derived from `TraceCapsule`, not from raw host payloads.

### Learning Gate Rules

New rules:

- Expectation correction requires a user-origin `CorrectionEvent` with evidence refs, objective invalidation evidence, or a legacy directional correction signal.
- High-confidence outcome requires verification evidence, user feedback, or a strong host stop signal.
- File-surface warnings require at least one `FileChangeEvent`.
- Adoption attribution requires matching injected expectations to tool, file, or verification evidence.
- Low-completeness trace capsules can still produce candidates only when they meet the minimum evidence rule for that candidate kind; they should not skip normal validation or promotion gates.

Minimum evidence rules:

```text
expectation_correction
  requires: user correction OR objective invalidation
  plus: corrected direction OR final accepted/verified result

verification_loop
  requires: objective VerificationEvent
  plus: task or tool evidence showing the verification changed execution

warning
  requires: FailureEvent OR violated injected expectation OR user rejection
  plus: a reusable trigger pattern

successful_fix
  requires: meaningful tool/file/verification evidence
  plus: success or partial-success outcome evidence

adoption_attribution
  requires: delivered node id
  plus: matched or violated injected expectation evidence
```

### Trajectory Matcher

The trajectory matcher should prefer trace events over plain `ToolEvent` summaries when a capsule exists:

```text
expected action
  -> match against ToolCallEvent, FileChangeEvent, VerificationEvent

expected avoidance
  -> verify absence or violation via FileChangeEvent and ToolCallEvent

expected verification
  -> match against VerificationEvent
```

## Storage Design

Add append-oriented tables:

```text
trace_capsules
- id
- host
- session_id
- turn_id
- scope_id
- cwd
- task_json
- outcome_json
- capture_json
- started_at
- ended_at
- created_at

trace_events
- id
- capsule_id
- event_index
- event_type
- source_json
- confidence
- payload_json
- evidence_ref_ids_json
- created_at

trace_evidence_refs
- id
- capsule_id
- kind
- source
- locator
- summary
- hash
- redaction_state
- unstable_source
- created_at
```

Add optional columns to existing runtime records:

```text
experience_input_records.trace_capsule_id nullable
experience_input_records.trace_completeness nullable
task_runs.trace_capsule_id nullable
task_runs.trace_completeness nullable
```

Implementation scope must include:

- SQLite schema migration for `trace_capsules`, `trace_events`, `trace_evidence_refs`, and optional columns on `experience_input_records` and `task_runs`
- domain type updates for `ExperienceInputRecord` and `TaskRun`
- repository updates for input records, task runs, and trace records
- inspect projection updates so legacy records and trace-backed records render consistently
- migration idempotence and no-op behavior for existing databases

No backfill is required for older records.

## Runtime Flow

```text
1. Prompt or invocation begins
   - create capsule
   - record user goal and injected node ids

2. Tool call proposed
   - append ToolCallEvent

3. Tool result observed
   - append ToolResultEvent
   - derive FailureEvent if failed
   - derive VerificationEvent for tests, typecheck, doctor, browser checks
   - derive FileChangeEvent for edit/write/apply_patch/change artifacts

4. User correction or review signal observed
   - append UserFeedbackEvent
   - derive CorrectionEvent if it changes goal, layer, boundary, verification order, or quality bar

5. Stop/finalize
   - append FinalMessageEvent
   - resolve TraceOutcome
   - project to ExperienceInput
   - run existing finalizeTask path
```

## Redaction And Bounds

Trace capture must be bounded:

- disabled by default until validated per host
- configurable per host and scope
- max events per capsule
- max summary length per event
- max evidence summary length
- max capsule bytes
- max retained capsules per scope
- TTL for trace events and evidence refs
- no unbounded stdout/stderr persistence
- no secret-looking payloads
- hash large payloads rather than storing them

Redaction should cover:

- API keys
- tokens
- private keys
- `.env` values
- authorization headers
- credentials in URLs
- suspicious high-entropy strings

If redaction is uncertain, mark `redactionState: "unknown"` and lower trace confidence.

Phase 1 persistence should be metadata-only or disabled by default. Full event/evidence persistence should require explicit opt-in after redaction, retention, and host capability checks pass. Cleanup should be deterministic and operator-visible so trace tables do not grow without bound.

## Inspect And Doctor

Add operator surfaces after the foundation exists:

```text
ee inspect --last --trace
ee inspect --trace <capsule-id>
ee inspect --trace <capsule-id> --projection
ee doctor codex --trace-capabilities
ee doctor claude-code --trace-capabilities
ee doctor antigravity --trace-capabilities
ee doctor openclaw --trace-capabilities
```

The doctor should report:

- enabled trace events
- missing host capabilities
- unstable transcript enrichment status
- last observed trace capsule
- last projection into `ExperienceInput`

Projection inspection should show:

- source trace capsule id and completeness
- projected `ExperienceInput`
- dropped or ignored events
- redaction decisions
- unstable evidence sources
- learning gate use or rejection reason
- parity difference from legacy projection when both are available

## Phased Plan

### Phase 1: Foundation, Shadow Only

- Add trace types.
- Add store and repositories.
- Add projector from `TraceCapsule` to `ExperienceInput`.
- Add capture capability profiles.
- Add trace feature flags and retention limits.
- Keep full trace persistence disabled by default; allow metadata-only shadow capture for validation.
- Do not change learning decisions.

Success criteria:

- Existing tests keep passing.
- A synthetic capsule projects to the same or richer `ExperienceInput`.
- No existing host behavior changes.
- Trace tables remain empty unless explicitly enabled.
- Metadata-only capture cannot store raw tool output or transcript excerpts.

### Phase 2: Claude Code Full Trace

- Capture richer Claude events: failures, batches, file changes, task completion, stop failure.
- Generate correction, file change, and verification events.
- Compare projected inputs against current inputs.

Success criteria:

- Real or fixture Claude hook payloads produce high-completeness capsules.
- Expectation correction examples no longer depend only on final summary text.

### Phase 3: Codex Upgrade

- Capture additional official Codex fields: transcript path, permission requests, subagent lifecycle, compaction events.
- Normalize `apply_patch`, Bash, and MCP tool events.
- Mark transcript enrichment as unstable.

Success criteria:

- Codex capsules include file and verification events when hook payloads support them.
- Incomplete tool coverage is visible in capture metadata.

### Phase 4: Antigravity Step-Indexed Trace

- Use `stepIdx`, `invocationNum`, `transcriptPath`, and `artifactDirectoryPath`.
- Reconstruct ordered tool call/result pairs.
- Enrich from artifacts when safe.

Success criteria:

- Antigravity capsules preserve step ordering.
- Stop reason and idle state affect outcome confidence.

### Phase 5: OpenClaw Native Trace

- Capture message/session/tool-result plugin events.
- Normalize OpenClaw gateway/session evidence into the same capsule model.

Success criteria:

- OpenClaw trace captures user messages, tool result persistence, and session finalization without pretending to be Claude/Codex.

### Phase 6: Learning Integration

- Add trace-derived windows to candidate source signals.
- Update learning eligibility to use evidence-backed corrections.
- Update trajectory matcher to prefer trace events when present.

Success criteria:

- Fewer `unknown` outcomes where verification evidence exists.
- Higher precision for expectation correction.
- No broad learning increase from low-completeness traces.

### Phase 7: Operator Surfaces

- Add inspect and doctor trace views.
- Show trace completeness and evidence source quality.

Success criteria:

- Operators can explain why a candidate was captured or rejected from trace evidence.

## Review Checklist

- Does `TraceCapsule` stay upstream of `ExperienceInput` rather than replacing it?
- Are host-specific fields isolated in adapters and evidence refs?
- Is transcript usage clearly best-effort when unstable?
- Does admissible content exclude hidden reasoning and provider reasoning fields?
- Are user-origin constraints separated from EE-origin injected expectations?
- Are capability profiles versioned and backed by documented or verified provenance?
- Are correction events evidence-backed?
- Are file changes represented without requiring full diff persistence?
- Is outcome confidence separated from outcome value?
- Can low-completeness traces avoid over-learning?
- Are minimum evidence thresholds defined per candidate kind?
- Does projection preserve legacy scope, task type, context adaptation, dedupe, and outcome behavior?
- Are legacy `experience_input_records` compatible without backfill?
- Are cross-host candidates normalized before becoming reusable nodes?
- Can the design be shipped host by host?
- Does doctor expose capture gaps clearly?
- Does inspect expose projection diffs and dropped events?
- Are retention, size limits, and feature flags explicit?
- Does the design preserve current docs language: EE is a governance layer, not a chat participant or generic memory system?

## Open Questions

Resolved before OpenSpec:

- Trace persistence should be gated by config and default to off or metadata-only until validated per host.
- User-origin constraints and EE-origin injected expectations must be separate fields.
- The legacy table target is `experience_input_records`, not `experience_inputs`.

Still open:

1. Should explicit user confirmation alone be enough for high-confidence trace-derived candidates, or should objective verification be required for some candidate kinds?
2. How much raw command output should be retained as evidence summary before hashing only?
3. Should transcript enrichment run during hook handling, or in a background queue after finalization?
4. Should `partial` outcome be added to the domain model, or remain trace-only until a later change?
5. What exact TTL and max-size defaults should ship for local trace tables?

## Recommended Next Step

Review this internal design first. If accepted, create an OpenSpec change named:

```text
add-host-trace-capsules
```

The OpenSpec change should commit only the approved implementation scope, not every exploratory idea in this document.
