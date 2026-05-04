## Context

This change depends on `freeze-current-intervention-governance`. Phase 1 should start only after current delivery-state mapping, injection mode decisions, evaluation mode behavior, scorecard persistence, and host summaries are protected by golden tests.

Current runtime concepts:

- `DeliveryState`: node eligibility (`shadow_only`, `conservative_only`, `eligible`, `quarantined`)
- `EvaluationMode`: run-level delivery experiment (`live`, `shadow`, `holdout`)
- `InjectionMode`: controller action (`skip`, `inject_conservative`, `inject`)

The refactor needs a prompt-strength layer without changing those three axes.

## Goals / Non-Goals

**Goals:**
- Add `InterventionStrength` as a typed, inspectable field.
- Derive strength deterministically from the existing selected node and mode.
- Store strength in scorecards and diagnostics.
- Keep existing prompt delivery behavior unchanged.

**Non-Goals:**
- Add diagnostic candidate delivery.
- Change renderer policy language.
- Add attribution records.
- Rename or rewrite lifecycle states.
- Add database schema migrations beyond existing scorecard JSON compatibility.

## Decisions

### 1. Strength is a prompt-meaning concept

`InterventionStrength` describes how the host agent should treat delivered guidance. It does not decide whether a node is eligible to be considered.

Rationale:
- The eligibility decision already lives in `DeliveryState`.
- The run-level suppression decision already lives in `EvaluationMode`.
- The controller action already lives in `InjectionMode`.

### 2. Strength is stored in scorecard JSON first

This change will add strength to diagnostics and `InjectionScorecard`. It will not add a top-level SQLite column.

Rationale:
- Scorecards already store decision diagnostics as JSON.
- This keeps the change backward compatible with existing SQLite rows.
- Later attribution records can normalize strength into a separate table when needed.

### 3. Initial derivation is conservative

Initial derivation should preserve current behavior:

- `inject_conservative` on candidate-like guidance maps to `diagnostic_hint` or `soft_recommendation`.
- mature validated active guidance maps to `strong_recommendation`.
- explicit confirmed user correction constraints may map to `hard_constraint`.

Rationale:
- Phase 1 should make strength visible without widening live injection.

## Risks / Trade-offs

- [Scorecard consumers may ignore the new field] → Accept; Phase 2 will use the field in renderer semantics.
- [Derivation may be too simple] → Accept; later phases can refine based on attribution and diagnostic candidate data.
- [Hard constraints may be overused] → Mitigate by only deriving them from explicit user-confirmed or highly validated rules.

## Implementation Plan

1. Confirm Phase 0 golden tests pass.
2. Add domain type and optional scorecard/diagnostic fields.
3. Add deterministic strength derivation in the controller.
4. Persist strength through `buildInjectionScorecard`.
5. Update interaction and MCP summaries only where they intentionally expose scorecard details.
6. Add regression tests proving `InjectionMode` and delivery behavior do not change.
