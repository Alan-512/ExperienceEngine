## Context

The current runtime implementation has grown into a large orchestration class. The architecture roadmap recommends splitting it, but doing so as a directory-first refactor would create unnecessary churn. This change should extract behavior-preserving services first and keep the existing facade so adapters remain stable.

## Goals / Non-Goals

**Goals:**

- Reduce `ExperienceRuntimeService` responsibility without changing behavior.
- Extract services in dependency order.
- Preserve all public and host-facing entrypoints.
- Keep each extraction covered by focused regression tests.

**Non-Goals:**

- Move the whole codebase into `src/core`.
- Redesign candidate, node, or injection schemas.
- Change hybrid behavior.
- Change install/repair/doctor semantics.

## Decisions

### Keep `ExperienceRuntimeService` as facade

Adapters and MCP tools should keep calling the same runtime facade during this refactor. Internally, the facade can delegate to focused services.

Alternative considered:
- Update all callers to new services immediately. Rejected because it expands blast radius and risks host regressions.

### Extract finalization before prompt intervention

Finalization currently contains task records, outcomes, learning trigger, and posttask work. Extracting it first reduces the largest complexity area while leaving prompt-time lookup stable.

Alternative considered:
- Extract prompt intervention first. Rejected because `ExperiencePromptRuntimeService` is already smaller and clearer.

### No behavior changes in this change

This change is structural. Any learning gate or injection policy behavior change belongs to separate changes.

Alternative considered:
- Combine with learning gate hardening. Rejected because it would make failures harder to isolate.

## Risks / Trade-offs

- [Refactor changes behavior accidentally] -> Use characterization tests around finalize, tool result recovery, injection resolution, and background learning.
- [Intermediate duplication appears] -> Allow short-lived delegation wrappers, then remove obsolete internal helpers after tests pass.
- [Hybrid code remains in runtime longer] -> Extract core finalization first; hybrid extraction can follow only after behavior is stable.

## Migration Plan

1. Add characterization tests around the runtime paths being extracted.
2. Extract `TaskFinalizationService` behind the facade.
3. Extract learning pipeline orchestration behind the finalization path.
4. Extract governance feedback orchestration if it is still coupled.
5. Keep host adapters unchanged throughout.
