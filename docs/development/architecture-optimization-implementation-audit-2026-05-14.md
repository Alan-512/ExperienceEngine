# Architecture Optimization Implementation Audit

Date: 2026-05-14

## Purpose

This document reconciles the original user-provided architecture optimization plan with the reviewed OpenSpec implementation work that followed it.

Original source document:

```text
C:\Users\123\Downloads\ExperienceEngine_Architecture_Optimization_Plan.md
```

Reviewed rewrite created in commit `9ce4e37`:

```text
docs/development/architecture-optimization-roadmap.md
```

Implementation and archive commit for the first OpenSpec batch:

```text
26b774e Archive architecture optimization changes
```

Important correction: the implementation direction came from `ExperienceEngine_Architecture_Optimization_Plan.md`, not from `internal-docs/experienceengine_final_refactor_plan .md`.

## Executive Summary

The full original optimization plan was not implemented end to end.

What was implemented is the reviewed first architecture-cleanup batch, split into five OpenSpec changes:

```text
clarify-ee-core-architecture
harden-learning-gate
split-runtime-services
tighten-injection-policy
explain-skipped-interventions
```

Those five changes were completed and archived. They cover the core near-term architecture correction:

```text
make the current architecture explicit
harden learning admission
split runtime responsibilities
make prompt injection more conservative
make no-injection decisions explainable
```

The original plan also contained broader design directions that were not fully implemented in that batch, including directory reorganization, a full candidate/node schema split, a full quality-band product surface, host-support simplification policy, and a complete operator/advanced capability separation plan.

## Source-To-Implementation Matrix

| Original plan area | Reviewed OpenSpec mapping | Status | Notes |
| --- | --- | --- | --- |
| Product position: EE is not generic memory; it is project experience governance | `clarify-ee-core-architecture`, public docs/spec wording | Implemented for architecture guidance | The positioning is now reflected in architecture docs and repo guidance. |
| Main loop: real task -> signals -> learning gate -> node -> compact injection -> governance | `clarify-ee-core-architecture`, `harden-learning-gate`, `tighten-injection-policy` | Implemented for core loop | The runtime still uses existing tables and facade boundaries; the loop is not a new directory architecture. |
| Document current architecture separately from future design | `clarify-ee-core-architecture` | Implemented, then corrected | `architecture.md` remains the current blueprint. The standing roadmap copy is now considered redundant and is being removed. |
| Strict learning admission | `harden-learning-gate` | Implemented | Deterministic eligibility now rejects expression-only, insufficient-evidence, and ordinary-success tasks before LLM distillation. |
| Learning rejection reasons visible to operators | `harden-learning-gate` | Implemented | Rejection reasons are persisted/exposed through task run and inspect paths. |
| Split `ExperienceRuntimeService` | `split-runtime-services` | Partially implemented by boundary extraction | `TaskFinalizationService` and `LearningPipelineService` exist, and `ExperienceRuntimeService` remains a facade. Full directory-level restructuring was intentionally not done. |
| Prompt intervention boundary | `split-runtime-services`, existing `prompt-service.ts` | Implemented as current boundary | `ExperiencePromptRuntimeService` already exists as prompt-time runtime. |
| Candidate and mature node schema separation | Not included as one of the five first-batch changes | Not fully implemented | The plan's proposed separate minimal candidate schema was not executed as a schema migration. Current production still uses existing candidate/node model with stricter eligibility. |
| Quality Band as derived explanation layer | `tighten-injection-policy` touched the concept as a non-gate; existing inspect uses `qualityBand` | Partially implemented | Quality band exists in inspect-style output, but it was not made a full standalone roadmap phase with complete product semantics. |
| Conservative injection and compact prompt policy | `tighten-injection-policy` | Implemented | Injection is bounded by compact rendering, maturity, delivery state, validation, recent harm, confidence, and intervention mode. |
| No raw history or candidates in prompt text | `tighten-injection-policy` | Implemented | Covered by renderer/intervention tests. |
| Explain why EE did not inject | `explain-skipped-interventions` | Implemented | Structured skip reasons are exposed through scorecard/inspect/explain surfaces. |
| Operator / advanced surface separation | Partly related to existing MCP broker/operator review work, not first-batch focus | Partially implemented outside this batch | Existing code has brokered actions, hygiene, export drafts, and operator review surfaces. The original plan's full separation policy was not comprehensively implemented as part of the five changes. |
| Host support simplification / choose one primary validation host | Not mapped into first batch | Not implemented | Later real-host validation was run manually, but no architecture-level host simplification policy was implemented. |
| Recommended future directory structure (`core/`, `operator/`, `experimental/`) | Explicitly deferred in reviewed rewrite | Not implemented by design | The reviewed plan added a constraint against early directory churn. |
| Minimum acceptance: all tests pass | All five changes | Implemented | `pnpm check` and OpenSpec validation were run during the completed work. |

## What The Review Changed Before Implementation

The original plan was a broad architecture direction. During review, it was narrowed before implementation:

```text
1. Avoid a one-shot refactor.
2. Avoid large directory moves before behavior and boundaries are stable.
3. Preserve host adapter behavior.
4. Avoid new persistent state unless the current model could not express the need.
5. Prioritize learning gate, runtime service boundaries, injection policy, and no-injection explanation.
```

That narrowing is why the actual OpenSpec batch did not implement every section of the original plan.

## Implemented OpenSpec Evidence

Completed and archived changes:

```text
openspec/changes/archive/2026-05-14-clarify-ee-core-architecture
openspec/changes/archive/2026-05-14-harden-learning-gate
openspec/changes/archive/2026-05-14-split-runtime-services
openspec/changes/archive/2026-05-14-tighten-injection-policy
openspec/changes/archive/2026-05-14-explain-skipped-interventions
```

Current active specs updated by archive include:

```text
openspec/specs/architecture-governance/spec.md
openspec/specs/experience-candidate-distillation/spec.md
openspec/specs/experience-learning-quality/spec.md
openspec/specs/runtime-service-boundaries/spec.md
openspec/specs/experience-intervention-governance/spec.md
openspec/specs/experience-retrieval-policy/spec.md
openspec/specs/mcp-native-interaction-surface/spec.md
```

Representative code evidence:

```text
src/analyzer/llm-learning-gate.ts
src/runtime/task-finalization-service.ts
src/runtime/learning-pipeline-service.ts
src/runtime/prompt-service.ts
src/controller/intervention-controller.ts
src/controller/injection-renderer.ts
src/controller/injection-scorecard.ts
src/controller/skip-scorecard.ts
```

## Items That Should Not Be Claimed Complete

Do not claim the original architecture optimization plan is fully implemented.

Still incomplete or only partially covered:

```text
full candidate/node schema split
full quality-band product model
directory migration into core/operator/experimental
host-support simplification policy
complete operator/advanced surface separation policy
fully automated real-host validation matrix
published-package and marketplace validation workflow
```

Some related foundations already exist, but they were either pre-existing or implemented through other work:

```text
AttributionRecordRepository
EpisodeRepository
RepoPolicyRepository
operator review flow
hygiene reports
export draft reports
Codex brokered actions
```

Those should be described as existing capabilities or adjacent foundations, not as proof that every item in the original optimization plan was completed.

## Documentation Decision

The standing roadmap copy is redundant because this project already uses:

```text
architecture design documents for direction
OpenSpec changes for implementation plans
docs/development/architecture.md for the current architecture blueprint
```

Therefore `docs/development/architecture-optimization-roadmap.md` should be deleted or not restored as a standing roadmap.

The durable rule should be:

```text
architecture.md describes current reality
design documents describe proposed direction
OpenSpec changes describe concrete implementation
audit documents reconcile historical plan-to-implementation decisions
```

## Recommended Next Step

If more work should continue from the original plan, create new OpenSpec changes from the incomplete items instead of reusing the full original document as an implementation checklist.

Recommended candidate changes:

```text
harden-host-upgrade-repair-validation
define-learning-quality-observability
complete-operator-surface-boundaries
formalize-quality-band-inspection-model
evaluate-candidate-node-schema-split
```

Each should include explicit scope, non-goals, tests, and whether it changes `docs/development/architecture.md`.
