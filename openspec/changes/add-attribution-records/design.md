## Context

This change depends on:

- `add-intervention-strength`
- `render-policy-aware-interventions`
- `gate-diagnostic-candidate-hints`

Phase 3 introduced record-only diagnostic candidate metadata and live `diagnostic_hint` delivery. Attribution records consume that metadata, but they must not make diagnostic evaluation look like normal delivered injection.

## Goals / Non-Goals

**Goals:**
- Record per-node attribution evidence for delivered interventions.
- Record diagnostic candidate attribution separately from delivered injected node ids.
- Make attribution inspectable for operators and future policy evaluation.
- Keep unknown and neutral attribution as first-class outcomes.
- Preserve the existing feedback/state machine.

**Non-Goals:**
- Replace `applyFeedback` or lifecycle promotion/quarantine logic.
- Infer `followed` or `changedExecutionPath` when there is no bounded evidence.
- Add episode projection or migrate ledgers.
- Add console UI or team-level policy controls.
- Promote diagnostic candidates directly to active nodes.

## Decisions

### 1. Attribution is append-only evidence

Attribution records should be written as a separate repository/table keyed by record id and linked to `injection_id` plus `node_id`.

Rationale:
- Existing injection and feedback tables remain the operational source of truth.
- Later policy layers can query attribution without rewriting historical governance.

### 2. Unknown is a valid result

Automatic attribution should write `unknown` when the system cannot make a bounded judgment. It should use weak helped/harmed verdicts only when current outcome evidence supports them.

Rationale:
- Overconfident attribution would make later circuit breakers and repo policies noisy.

### 3. Manual helped/harmed remains an override

Manual user feedback should be reflected as an attribution override, but the current manual feedback path remains intact.

Rationale:
- Product language treats automatic outcome attribution as normal and manual feedback as an override. This change should make that relationship visible without changing state transitions.

### 4. Diagnostic records are not delivered injection records

Record-only diagnostic candidates should create attribution records with `delivered=false` and a diagnostic source/reason. They must not add node ids to `injected_node_ids`, `session.injectedNodeIds`, or helped/harmed counters.

Rationale:
- Phase 3 intentionally separated first-reuse diagnostic evidence from prompt delivery.

## Risks / Trade-offs

- [Attribution may be sparse] -> Accept; `unknown` is better than false precision.
- [Extra writes may complicate finalize] -> Keep writes append-only and after existing resolution logic.
- [Manual override semantics may drift] -> Keep the old feedback path as-is and only mirror override evidence into attribution.

## Implementation Plan

1. Add attribution domain types and SQLite schema.
2. Implement `AttributionRecordRepository` with write and inspection queries.
3. Write attribution records during task finalization after existing injection resolution.
4. Add record-only diagnostic attribution from Phase 3 metadata.
5. Surface attribution records in verbose inspection and summary code where already appropriate.
6. Add regression tests proving existing feedback counters and lifecycle transitions do not change.
