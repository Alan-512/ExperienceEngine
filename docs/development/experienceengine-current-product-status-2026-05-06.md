# ExperienceEngine Current Product Status

Date: 2026-05-06

## Purpose

This document records the post-archive product baseline after the execution-oriented refactor phases were implemented and synced into OpenSpec specs.

The relationship between the planning documents remains:

- `internal-docs/experienceengine_final_refactor_plan .md` describes the broader product end-state.
- `internal-docs/experienceengine_refactor_implementation_plan.md` describes the execution route used to reach the current baseline.
- `openspec/specs/*` now contains the authoritative implemented requirements for the archived slices.

## Current Baseline

ExperienceEngine is currently a production-first experience governance layer around coding agents. The implemented baseline is not a generic memory/RAG layer and should not be described as a separate chat participant.

Implemented product capabilities now include:

- Production-safe live injection through delivery-state, evaluation-mode, and repo-policy gates.
- Distinct `InterventionStrength` semantics without overloading `DeliveryState`, `EvaluationMode`, or `InjectionMode`.
- Renderer policy language that lets scorecard risk and strength affect prompt wording.
- Diagnostic candidate recording and gated live delivery for same-scope, low-risk, strong-trigger matches.
- Append-only attribution records as evidence, without replacing the main feedback and lifecycle state machine.
- Episode projection compatibility over existing tables, without a full ledger migration.
- Repo mode and circuit breaker behavior that tunes diagnostics while preserving stronger disabled-scope and lifecycle gates.
- Read-only repo policy inspection with bounded evidence and restore guidance.
- Read-only hygiene review reports.
- Read-only guidance export draft reports.
- Read-only operator review flow that coordinates repo policy, hygiene, and export drafts.

## Concept Boundaries

These boundaries are current product constraints, not optional implementation details:

- `DeliveryState` controls whether a node is eligible for delivery.
- `EvaluationMode` controls whether the run is live, shadow, or holdout.
- `InjectionMode` controls the controller action for a decision.
- `InterventionStrength` controls the prompt meaning of delivered guidance.
- Attribution records are evidence records; they do not directly increment feedback counters or rewrite lifecycle transitions.
- Episode projection is a compatibility read model; it is not a full event ledger migration.
- Repo policy may tighten or relax diagnostic delivery, but disabled scopes, quarantined nodes, retired nodes, and destructive-risk gates remain authoritative.
- Hygiene, export drafts, repo policy inspection, and operator review are read-only operator surfaces unless a separate spec explicitly adds mutation.

## OpenSpec Baseline

The following specs now represent the archived Phase 0-7 execution baseline:

- `openspec/specs/experience-intervention-governance/spec.md`
- `openspec/specs/experience-attribution-records/spec.md`
- `openspec/specs/experience-episode-projection/spec.md`
- `openspec/specs/experience-repo-policy/spec.md`
- `openspec/specs/repo-policy-console/spec.md`
- `openspec/specs/experience-hygiene-review/spec.md`
- `openspec/specs/experience-export-drafts/spec.md`
- `openspec/specs/operator-review-flow/spec.md`
- `openspec/specs/cli-user-experience-surface/spec.md`
- `openspec/specs/mcp-native-interaction-surface/spec.md`

Recent archived changes:

- `2026-05-06-freeze-current-intervention-governance`
- `2026-05-06-add-intervention-strength`
- `2026-05-06-render-policy-aware-interventions`
- `2026-05-06-gate-diagnostic-candidate-hints`
- `2026-05-06-add-attribution-records`
- `2026-05-06-add-episode-projection-compat`
- `2026-05-06-add-repo-mode-circuit-breaker`
- `2026-05-06-surface-repo-policy-console`
- `2026-05-06-consolidate-operator-review-surfaces`

## What Not To Do Next

Do not start with a broad console rewrite. The current surfaces are intentionally read-only and inspect-first.

Do not migrate the database to a full ledger until attribution records, episode projection, and operator review behavior have runtime evidence across normal use.

Do not implement team capabilities yet. Team workflows remain a product-end-state direction, not the next execution slice.

Do not turn export drafts into automatic file writers. Export remains reviewable guidance until a separate write/export safety model exists.

## Next Execution Slice

The next change should productize the read-only operator workflow before adding broader UI or mutation:

1. Improve `ee inspect review` output for repeated operator use.
2. Add user-guide documentation for repo policy, hygiene, export draft, and operator review workflows.
3. Make MCP capability descriptions and drill-down paths consistent across review surfaces.
4. Add examples that show review-only behavior and manual drill-down, without introducing mutation.
5. Keep validation focused on CLI/MCP/report contracts and OpenSpec strict validation.

Suggested OpenSpec change name:

```text
productize-operator-review-workflow
```

## Later Slices

After the operator workflow is usable and documented:

1. Experience hygiene polish: clearer priority wording, risk grouping, and cross-links from operator review.
2. Export draft polish: clearer readiness/risk language and explicit review handoff.
3. Console prototype: inspect/report aggregation only, no mutation dashboard.
4. Experience hygiene / export hygiene automation: only after read-only reports have stable operator usage.
5. Team capability design: remote, after single-user governance surfaces are stable.
