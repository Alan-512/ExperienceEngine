## Context

This change depends on:

- `add-intervention-strength`
- `render-policy-aware-interventions`

Diagnostic hints must use `InterventionStrength=diagnostic_hint` and the policy-aware renderer language. They must not require a lifecycle-state rewrite.

## Goals / Non-Goals

**Goals:**
- Let same-scope shadow candidates participate in diagnostic evaluation.
- Record candidate matches before live delivery is enabled.
- Allow live diagnostic hints only under a strict gate.
- Keep the main state machine unchanged.

**Non-Goals:**
- Promote candidates directly to active.
- Allow cross-scope diagnostic hints.
- Allow multiple live candidate hints in one prompt.
- Add attribution records or episode projections.
- Replace `DeliveryState`.

## Decisions

### 1. Diagnostic evaluation has two stages

Stage A records diagnostic candidate matches without prompt delivery. Stage B permits prompt delivery only for candidates passing a strong gate.

Rationale:
- It gives operators data about first-reuse recall and false positives before opening the prompt path.

### 2. Diagnostic safety is separate from existing injection risk

A live diagnostic hint must pass a dedicated diagnostic-safety predicate. It must not reuse the existing `InjectionRiskLevel` as the whole gate, because ordinary `shadow_only` candidates are intentionally high risk for normal injection. Diagnostic safety means the candidate is same-scope, same task family, strategy-like or investigation-oriented, has no negative evidence, no harm history, enough total score, enough margin, and contains no destructive or irreversible action guidance.

Rationale:
- Candidate guidance is not validated enough for cross-scope reuse.
- Normal injection risk and diagnostic-safety are related but not equivalent.

### 3. Record-only evaluation has a durable metadata contract

Record-only matches should persist named diagnostic metadata without making the event look delivered. The durable shape should keep `mode=skip`, `delivered=false`, and `injected_node_ids=[]`, while storing bounded candidate ids and match reasons in scorecard or decision diagnostic metadata such as `recordOnlyDiagnosticCandidateIds`.

Rationale:
- Operators need first-reuse recall evidence without polluting delivered injection ids.
- Later attribution work needs a clear source field.

### 4. Diagnostic hint delivery is capped at one node

When more than one candidate qualifies, ExperienceEngine should deliver at most the top candidate.

Rationale:
- The goal is a diagnostic lead, not a new unvalidated playbook.

### 5. Candidate remains candidate

Delivering a diagnostic hint does not by itself promote the node to `active`.

Rationale:
- Promotion should still require helped/support evidence or later attribution.

## Risks / Trade-offs

- [Useful candidates may still remain silent] → Accept; the first live gate should bias toward safety.
- [Record-only evaluation may add noisy events] → Store bounded diagnostic ids in scorecards rather than inflating normal injected node ids.
- [Users may expect diagnostic hint to count as helped automatically] → Defer to later attribution work.

## Implementation Plan

1. Add same-scope diagnostic candidate repository query.
2. Add record-only diagnostic matching and scorecard metadata with a named field.
3. Add dedicated diagnostic-safety predicate.
4. Add strict live diagnostic gate.
5. Cap live diagnostic delivery at one node.
6. Add tests for all negative gate conditions and for unchanged state transitions.
