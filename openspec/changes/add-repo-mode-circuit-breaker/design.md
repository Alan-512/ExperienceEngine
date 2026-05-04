## Context

This change depends on:

- `add-attribution-records`
- `add-episode-projection-compat` where episode grouping is available

Repo policy can compute from attribution records first and fall back to injection events for older data. It should not require a completed ledger migration.

## Goals / Non-Goals

**Goals:**
- Add repo experience modes that tune diagnostic candidate aggressiveness.
- Add deterministic circuit breaker downgrade behavior from recent evidence.
- Keep scope disabled flags and existing delivery-state gates authoritative.
- Make policy state inspectable and manually restorable.

**Non-Goals:**
- Add console UI.
- Add team or organization policy.
- Replace `DeliveryState`, `EvaluationMode`, `InjectionMode`, or `InterventionStrength`.
- Rewrite learning, feedback, or lifecycle state machines.
- Create a global off/shadow mode outside the planned repo modes.

## Decisions

### 1. Repo modes tune diagnostic gates, not delivery-state semantics

The modes are:

- `safe`: default Phase 3 diagnostic gate.
- `fast_learning`: slightly lowers diagnostic thresholds, but never allows cross-scope, harmed, negative-evidence, destructive, or quarantined candidates.
- `strict`: raises diagnostic thresholds and can temporarily disable live diagnostic candidates after circuit breaker trips.

Rationale:
- This avoids mixing repo policy with `DeliveryState`, `EvaluationMode`, or `InjectionMode`.

### 2. Scope disabled remains hard off

Existing disabled scope behavior remains more authoritative than repo mode. Repo mode can tighten or loosen diagnostic candidate gates only inside still-enabled scopes.

Rationale:
- Operators already have a hard safety control; this change should not weaken it.

### 3. Circuit breaker downgrades deterministically

The circuit breaker should compute recent harmful or low-trust intervention evidence from attribution records, with injection events as fallback. Threshold breaches downgrade:

- `fast_learning` to `safe`
- `safe` to `strict`
- `strict` remains strict and disables live diagnostic candidates temporarily

Rationale:
- This gives a production-safe automatic recovery path without deleting data or mutating node lifecycle.

### 4. Manual restore is explicit

Users should be able to inspect current repo policy and restore a stricter circuit state back to the configured mode.

Rationale:
- Automatic tightening is useful only if operators can understand and reverse it after investigation.

## Risks / Trade-offs

- [Fast learning can increase false positives] -> Keep hard gates against cross-scope, harmed, negative, destructive, and quarantined candidates.
- [Circuit breaker may be too sensitive] -> Make thresholds deterministic, inspectable, and covered by tests.
- [Policy terms can blur with existing modes] -> Keep repo mode names and effects documented as gate policy only.

## Implementation Plan

1. Add repo policy domain types and persistence.
2. Implement a pure repo policy evaluator over attribution records and injection fallback evidence.
3. Apply policy to the diagnostic candidate gate in runtime/controller flow.
4. Add config/interaction commands for inspect and manual restore.
5. Add tests for each mode, circuit downgrade, strict temporary diagnostic disable, and scope-disabled precedence.
