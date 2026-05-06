## 1. Review Flow Builder

- [x] 1.1 Add a pure `src/maintenance/operator-review-flow.ts` summarizer with report types, stable minimal shape, bounded item selection, review order, drill-down references, and review-only next actions.
- [x] 1.2 Combine repo policy health, hygiene summary, and export draft summary without requiring database access in the summarizer.
- [x] 1.3 Prioritize tripped repo policy and high-severity hygiene risks before export-ready draft review.

## 2. Interaction And Inspect Surfaces

- [x] 2.1 Add `ExperienceInteractionService.inspectReview()` to resolve scope, collect existing repo/hygiene/export-draft reports, and return the operator review report without mutating stored state.
- [x] 2.2 Add `ee inspect review` with scope/cwd and limit filters.
- [x] 2.3 Add a Codex/MCP `experienceengine://review` read-only resource and broker action `inspect_operator_review`.
- [x] 2.4 Update MCP capabilities metadata to list the review resource.

## 3. Documentation Hygiene

- [x] 3.1 Replace the archived placeholder Purpose in `openspec/specs/experience-export-drafts/spec.md` with durable product wording as direct documentation hygiene, not an OpenSpec delta.

## 4. Tests

- [x] 4.1 Add unit coverage for review flow summarization, stable report shape, empty reports, risk prioritization, bounded findings/drafts, drill-down references, and review-only next actions.
- [x] 4.2 Add mutation-guard coverage proving review inspection does not write lifecycle, attribution, review, repo policy, or managed snapshot state.
- [x] 4.3 Add CLI and Codex/MCP tests for review report output and filter handling.

## 5. Validation

- [x] 5.1 Run targeted unit tests for operator review flow, interaction service, CLI, and Codex/MCP surfaces.
- [x] 5.2 Run `pnpm check`.
- [x] 5.3 Run `openspec validate consolidate-operator-review-surfaces --strict` and `openspec validate --changes --strict`.
