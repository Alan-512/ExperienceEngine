## 1. Draft Builder

- [ ] 1.1 Add a pure `src/maintenance/experience-export-drafts.ts` builder with report types, filters, deterministic ordering, and default limits.
- [ ] 1.2 Build drafts from formal nodes only, including guidance, applicability, evidence, provenance refs, lifecycle/delivery state, and risk notes.
- [ ] 1.3 Include hygiene context when available without making hygiene findings executable actions.

## 2. Interaction And Inspect Surfaces

- [ ] 2.1 Expose export draft reports through `ExperienceInteractionService` without mutating nodes, candidates, attribution, injection, review, repo policy, or managed state snapshots.
- [ ] 2.2 Add a CLI inspect/export draft surface with scope/cwd, node id, node type, task family, risk, and limit filters.
- [ ] 2.3 Add a Codex/MCP read-only resource or broker action for export draft inspection.

## 3. Tests

- [ ] 3.1 Add unit coverage for draft generation, empty reports, filters, deterministic ordering, and raw-candidate exclusion.
- [ ] 3.2 Add mutation-guard coverage proving export draft inspection does not write lifecycle, attribution, review, repo policy, or snapshot state.
- [ ] 3.3 Add CLI and Codex/MCP tests for report output and filter handling.

## 4. Validation

- [ ] 4.1 Run targeted unit tests for export drafts, interaction service, CLI, and Codex/MCP surfaces.
- [ ] 4.2 Run `pnpm check`.
- [ ] 4.3 Run `openspec validate add-experience-export-drafts --strict` and `openspec validate --changes --strict`.
