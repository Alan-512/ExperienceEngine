## Context

ExperienceEngine currently finalizes tasks through a compact `ExperienceInput` built from `HostPromptContext` and `ToolEvent[]`. That contract is intentionally stable and already supports retrieval, learning, attribution, and inspection. The limitation is evidence quality: compact tool summaries and final context often cannot explain user corrections, file-change boundaries, verification meaning, or whether injected guidance was actually adopted.

Codex, Claude Code, Antigravity, and OpenClaw expose different lifecycle surfaces. Some hosts provide rich tool and file-change hooks; others require plugin-native events or best-effort transcript/artifact enrichment. The design needs to capture what each host can reliably provide without hard-coding host behavior into the learning layer or making raw transcript storage a product dependency.

## Goals / Non-Goals

**Goals:**

- Add a bounded host-neutral `TraceCapsule` evidence layer upstream of `ExperienceInput`.
- Capture normalized task, event, evidence, outcome, capability, and completeness metadata.
- Keep `ExperienceInput` as the stable learning and retrieval contract.
- Support cross-host experience reuse while preserving host-local applicability when an experience is genuinely host-specific.
- Preserve old `experience_input_records` without requiring backfill.
- Make trace persistence gated, bounded, redacted, and inspectable.
- Improve expectation correction, verification-loop, warning, and adoption attribution quality with trace-derived evidence windows.

**Non-Goals:**

- Do not persist chain-of-thought, provider reasoning fields, hidden model traces, or unbounded raw transcripts.
- Do not replace `ExperienceInput` or require trace data for retrieval.
- Do not require all hosts to support the same events.
- Do not enable full trace persistence by default during the first rollout.
- Do not migrate historical records into trace capsules.

## Decisions

### Decision: Add `TraceCapsule` as an upstream optional evidence layer

`TraceCapsule` captures host-neutral trace data and projects into the existing `ExperienceInput` path. This preserves current learning/retrieval behavior while allowing richer evidence to improve candidate signals and attribution.

Alternative considered: replace `ExperienceInput` with trace data directly. This was rejected because it would make legacy records and existing retrieval/learning code depend on a new broad model all at once.

### Decision: Separate user-origin requirements from EE-origin injected expectations

`TraceTask` separates `userConstraints` / `userNonGoals` from `injectedExpectations` / `deliveredNodeIds`. This prevents injected guidance from being learned back as if the user originally requested it.

Alternative considered: store one combined constraints list. This was rejected because it can contaminate reusable experience and weaken cross-host portability.

### Decision: Use versioned capability profiles with provenance

Each host trace adapter declares capability profiles with `profileVersion`, `adapterVersion`, observed timestamps, and per-capability provenance such as `verified`, `documented`, `inferred`, or `disabled`. Runtime doctor/probe results are authoritative when available.

Alternative considered: static per-host capability constants. This was rejected because host behavior changes over time and can differ between documented support and real runtime behavior.

### Decision: Keep host payloads out of normalized event payloads

Trace events store normalized fields and a small `TraceEventSource` envelope. Raw host payloads are summarized or hashed through evidence refs. This keeps adapter details isolated and avoids leaking host-specific shapes into learning.

Alternative considered: persist raw hook payloads as event JSON. This was rejected because it increases privacy risk, storage size, and accidental coupling to unstable host schemas.

### Decision: Gated metadata-only shadow mode first

Phase 1 adds types, storage, projection, and capability reporting, but full event/evidence persistence remains disabled by default. Metadata-only shadow capture can be enabled per host/scope after redaction and retention checks.

Alternative considered: turn on full trace persistence immediately because it is "shadow only." This was rejected because shadow persistence still stores potentially sensitive data and can bloat SQLite.

### Decision: Projection must preserve legacy behavior

The projector must either call `buildExperienceInput(...)` with a synthetic host-neutral context or prove parity with existing behavior through fixtures. It must preserve scope resolution, task type resolution, context adaptation, tool-event dedupe, and outcome behavior unless higher-confidence trace outcome evidence is explicitly enabled.

Alternative considered: let each host adapter build `ExperienceInput` directly from trace data. This was rejected because it would duplicate logic and make host-specific drift likely.

## Risks / Trade-offs

- Host official APIs and real runtime behavior can diverge -> capability profiles include provenance and doctor/probe output.
- Trace data can become a privacy or storage liability -> default off/metadata-only, redaction, size caps, TTL, and hashed evidence summaries.
- Transcript enrichment can accidentally depend on unstable or non-user-visible content -> transcript use is best-effort only and limited to admissible user/tool-visible content.
- Rich trace data can over-promote low-quality candidates -> minimum evidence rules are required per candidate kind, and low-completeness traces cannot bypass promotion gates.
- Cross-host reuse can be polluted by host-specific events -> distillation must normalize into host-neutral concepts unless a candidate is explicitly marked host-local.
- Projection may drift from legacy behavior -> parity tests must cover representative payloads for Codex, Claude Code, Antigravity, and OpenClaw.

## Migration Plan

1. Add trace domain types, repositories, schema migration, feature flags, and retention configuration.
2. Add nullable `trace_capsule_id` and `trace_completeness` metadata to `experience_input_records` and `task_runs`.
3. Implement metadata-only shadow capture and projector parity tests without changing learning decisions.
4. Add host capability profile reporting and doctor surfaces.
5. Enable host adapters one at a time: Claude Code, Codex, Antigravity, then OpenClaw.
6. Add trace-derived learning and attribution windows after projection parity and storage safety are validated.
7. Add inspect projection diff surfaces and operator review integration.

Rollback is additive: disable trace flags, leave trace tables unused, and continue using existing `ExperienceInput` records. Existing behavior must not require trace tables to be populated.

## Open Questions

- Should explicit user confirmation alone be enough for high-confidence trace-derived candidates, or should objective verification be required for some candidate kinds?
- What exact TTL and max-size defaults should ship for local trace tables?
- Should transcript enrichment run during hook handling or only in a background queue after finalization?
- Should `partial` outcome remain trace-only or become a domain-level outcome later?
