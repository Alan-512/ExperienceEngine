## 1. Trace Foundation

- [ ] 1.1 Add trace domain types for `TraceCapsule`, `TraceTask`, `TraceEvent`, `TraceEventSource`, `EvidenceRef`, `TraceOutcome`, capture metadata, and host capability profiles.
- [ ] 1.2 Add configuration flags for per-host/per-scope trace capture, metadata-only shadow mode, retention limits, event limits, evidence summary limits, and TTL.
- [ ] 1.3 Add redaction and bounded-summary utilities for trace evidence refs, including secret-like value detection and hash generation for large payloads.
- [ ] 1.4 Add trace storage schema for `trace_capsules`, `trace_events`, and `trace_evidence_refs`.
- [ ] 1.5 Add nullable `trace_capsule_id` and `trace_completeness` columns to `experience_input_records` and `task_runs`.
- [ ] 1.6 Add trace repositories with idempotent writes, lookup by capsule id, lookup by task run/input record, and bounded cleanup.
- [ ] 1.7 Add unit tests for schema migration idempotence, repository round trips, retention cleanup, and redaction behavior.

## 2. Projection And Compatibility

- [ ] 2.1 Implement `TraceCapsule -> ExperienceInput` projection using existing scope resolution, task-type resolution, context adaptation, tool-event normalization, and outcome resolution where applicable.
- [ ] 2.2 Implement tool-event dedupe so derived `FailureEvent` records do not double-count the same host tool result.
- [ ] 2.3 Preserve user-origin fields separately from EE-origin injected expectations in projection and attribution inputs.
- [ ] 2.4 Add fixture parity tests proving trace projection matches or enriches legacy projection for representative Codex, Claude Code, Antigravity, and OpenClaw payloads.
- [ ] 2.5 Ensure legacy `experience_input_records` without trace metadata remain readable, inspectable, retrievable, and reusable without backfill.

## 3. Capability Profiles And Doctor

- [ ] 3.1 Implement versioned host trace capability profiles with capability state, provenance, transcript stability, tool coverage, adapter version, and observed timestamps.
- [ ] 3.2 Add doctor/probe reporting for `ee doctor <host> --trace-capabilities`.
- [ ] 3.3 Ensure runtime-observed capability results override static adapter defaults when available.
- [ ] 3.4 Add tests for verified, documented, inferred, disabled, and unavailable capability states.

## 4. Host Trace Adapters

- [ ] 4.1 Add Claude Code trace normalization for prompt, tool call/result, tool failure, file change, task completion, stop, and stop failure events.
- [ ] 4.2 Add Codex trace normalization for prompt, supported tool call/result, permission request, subagent lifecycle, compaction, stop, and best-effort transcript enrichment metadata.
- [ ] 4.3 Add Antigravity trace normalization for invocation, step-indexed tool call/result, stop reason, transcript path metadata, and artifact path metadata.
- [ ] 4.4 Add OpenClaw trace normalization using message/session/plugin-native tool result events without forcing Claude/Codex hook semantics.
- [ ] 4.5 Mark unstable transcript or artifact enrichment through `TraceEventSource` and evidence refs.
- [ ] 4.6 Add host fixture tests for normalized events, capability metadata, and admissible content boundaries.

## 5. Learning And Attribution Integration

- [ ] 5.1 Extend candidate source signals with trace-derived correction, verification, change-surface, adoption, trace-completeness, and source-provenance windows.
- [ ] 5.2 Add minimum evidence rules per candidate kind for expectation correction, verification loop, warning, successful fix, and adoption attribution.
- [ ] 5.3 Update learning eligibility so low-completeness or unstable-source traces cannot produce high-confidence guidance unless minimum evidence rules pass.
- [ ] 5.4 Update candidate creation and distillation inputs to carry trace provenance without copying raw host payloads into reusable node text.
- [ ] 5.5 Update trajectory matching to prefer trace events for expected actions, avoidance, verification, and injected expectation adoption when a capsule is available.
- [ ] 5.6 Update attribution record writing to reference matched or violated trace evidence while preserving unknown when evidence is insufficient.
- [ ] 5.7 Add tests covering trace-backed expectation correction, verification loop, host-local candidate scoping, unknown attribution, and legacy fallback behavior.

## 6. Operator Surfaces

- [ ] 6.1 Add `ee inspect --trace <capsule-id>` for bounded trace capsule inspection.
- [ ] 6.2 Add `ee inspect --trace <capsule-id> --projection` showing projected `ExperienceInput`, dropped events, redaction decisions, unstable sources, completeness, and learning use/rejection reason.
- [ ] 6.3 Extend verbose/latest inspection to show trace capsule linkage and completeness when available.
- [ ] 6.4 Extend operator review output with trace capture quality and projection diagnostics without mutating state.
- [ ] 6.5 Add CLI/MCP tests for trace inspection output bounds and legacy behavior when trace metadata is absent.

## 7. Validation And Documentation

- [ ] 7.1 Run focused unit tests for trace storage, projection, capability profiles, host adapters, learning integration, attribution, and inspection.
- [ ] 7.2 Run broader validation for existing runtime, learning, retrieval, attribution, and host adapter tests to verify no legacy behavior regression.
- [ ] 7.3 Update `README.md`, `README.zh-CN.md`, and `docs/user-guide.md` only where operator-facing trace capability behavior changes.
- [ ] 7.4 Document that trace capture is bounded, gated, and not chain-of-thought or raw transcript storage.
- [ ] 7.5 Validate at least one real or fixture-backed host path before enabling more than metadata-only capture for that host.
