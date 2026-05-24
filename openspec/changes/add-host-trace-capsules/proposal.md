## Why

ExperienceEngine currently learns from compact finalized task inputs, which is sufficient for many command and configuration fixes but too weak for reliable causal attribution, user-correction learning, and cross-host evidence quality. Host adapters now expose richer lifecycle signals, so EE should capture bounded decision-grade trace evidence while preserving `ExperienceInput` as the stable learning and retrieval contract.

## What Changes

- Introduce a host-neutral `TraceCapsule` layer that captures task goal, user constraints, EE injected expectations, normalized execution events, evidence refs, outcome confidence, and capture completeness.
- Add host trace capability profiles with versioned, observed provenance so Codex, Claude Code, Antigravity, and OpenClaw can capture the maximum reliable data each host supports without hard-coding assumptions.
- Add safe, gated persistence for trace capsules, trace events, and evidence refs, with trace capture disabled or metadata-only by default until validated per host/scope.
- Project trace capsules into existing `ExperienceInput` records through a compatibility-preserving projector instead of replacing the current learning input model.
- Enrich candidate signals, learning eligibility, trajectory matching, and attribution with trace-derived correction, verification, file-change, adoption, and provenance windows.
- Add inspect and doctor surfaces for trace capability status, trace completeness, projection diffs, dropped events, and redaction decisions.
- Preserve legacy data compatibility: old `experience_input_records` remain valid, retrieval does not require trace data, and no historical backfill is required.

No breaking changes are intended.

## Capabilities

### New Capabilities

- `host-trace-capsules`: Host-neutral capture, persistence, projection, inspection, and compatibility rules for bounded execution trace evidence.

### Modified Capabilities

- `experience-learning-quality`: Learning eligibility and candidate source signals may use trace-derived correction, verification, file-change, adoption, and provenance evidence.
- `experience-candidate-distillation`: Candidates created from trace-backed runs must carry source provenance and avoid host-specific payload leakage into reusable nodes.
- `experience-retrieval-policy`: Retrieval remains compatible with trace-less legacy records while trace-derived portability and provenance signals may improve ranking and diagnostics.
- `experience-attribution-records`: Help/harm and adoption attribution may use trace-derived evidence windows when available.
- `operator-review-flow`: Operator inspection should expose trace completeness, projection diffs, dropped events, and redaction decisions.

## Impact

- Runtime/domain types: trace capsule types, trace event types, evidence refs, capability profiles, and optional trace metadata on `ExperienceInputRecord` and `TaskRun`.
- SQLite storage: append-only trace tables plus additive nullable columns on `experience_input_records` and `task_runs`.
- Host adapters: Codex, Claude Code, Antigravity, and OpenClaw trace adapters and capability profile reporting.
- Input pipeline: deterministic `TraceCapsule -> ExperienceInput` projection with parity tests against legacy behavior.
- Learning and attribution: trace-derived source signal windows and minimum evidence rules.
- Operator surfaces: `ee inspect --trace`, projection inspection, and `ee doctor <host> --trace-capabilities`.
- Configuration and safety: per-host/per-scope feature flags, metadata-only shadow mode, redaction, retention, and size limits.
