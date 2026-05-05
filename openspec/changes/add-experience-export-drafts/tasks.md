## 1. Draft Builder

- [x] 1.1 Add a pure `src/maintenance/experience-export-drafts.ts` builder with report types, filters, deterministic ordering, and default limits.
- [x] 1.2 Build drafts from default-exportable formal nodes only, including guidance, applicability, evidence, provenance refs, lifecycle/delivery state, and risk notes.
- [x] 1.3 Add explicit low-readiness handling: cooling, conservative-only, priority-candidate, retired, quarantined, harmed, and diagnostic-only nodes are excluded by default or returned only with risk notes when explicitly filtered.
- [x] 1.4 Include advisory target types limited to `instruction_note`, `repo_guidance`, `skill_candidate`, `documentation_note`, and `do_not_export`.
- [x] 1.5 Include hygiene context when available, downgrading high-severity findings to `do_not_export` without making hygiene findings executable actions.

## 2. Interaction And Inspect Surfaces

- [x] 2.1 Expose export draft reports through `ExperienceInteractionService` without mutating nodes, candidates, attribution, injection, review, repo policy, or managed state snapshots.
- [x] 2.2 Add `ee inspect export-drafts` with scope/cwd, node id, node type, task family, lifecycle state, delivery state, risk, and limit filters; do not change the managed state snapshot `ee export` semantics.
- [x] 2.3 Add a Codex/MCP read-only resource and broker action for export draft inspection.

## 3. Tests

- [x] 3.1 Add unit coverage for draft generation, empty reports, filters, deterministic ordering, target type assignment, default exportability, explicit low-readiness inspection, and raw-candidate exclusion.
- [x] 3.2 Add unit coverage proving high-severity hygiene findings produce risk notes and a `do_not_export` suggested target type.
- [x] 3.3 Add mutation-guard coverage proving export draft inspection does not write lifecycle, attribution, review, repo policy, or managed snapshot artifacts.
- [x] 3.4 Add CLI and Codex/MCP tests for report output and filter handling.

## 4. Validation

- [x] 4.1 Run targeted unit tests for export drafts, interaction service, CLI, and Codex/MCP surfaces.
- [x] 4.2 Run `pnpm check`.
- [x] 4.3 Run `openspec validate add-experience-export-drafts --strict` and `openspec validate --changes --strict`.
