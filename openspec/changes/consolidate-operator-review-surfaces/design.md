## Context

Phase 7 now has three useful but separate operator inspection loops:

- repo policy / circuit evidence through repo summary
- experience hygiene findings
- guidance export drafts

Those slices are intentionally read-only and review-oriented. The remaining gap is orchestration: an operator needs one place to understand whether the repo is healthy, what quality risks need attention, and whether any guidance is ready to export.

## Goals / Non-Goals

**Goals:**

- Add one bounded operator review report for a scope.
- Combine repo policy, hygiene, and export-draft summaries without duplicating every detail.
- Preserve drill-down commands/resources for the detailed reports.
- Keep all output read-only and non-mutating.
- Keep the first surface CLI/MCP-friendly, not a full graphical console.

**Non-Goals:**

- No web console or TUI.
- No automatic lifecycle mutation, repo policy restore, node merge, candidate discard, or export write.
- No new persistence table or report ledger.
- No team/org publishing workflow.
- No replacement of existing `ee inspect repo`, `ee inspect hygiene`, or `ee inspect export-drafts`.

## Decisions

### 1. Build a pure review flow summarizer

Create `src/maintenance/operator-review-flow.ts` as a pure summarizer over existing report objects: repo summary, hygiene report, and export draft report.

Rationale:

- Keeps the flow testable without database side effects.
- Reuses the already reviewed read-only slices.
- Avoids another persistence model.

### 2. Service orchestration owns data collection

`ExperienceInteractionService.inspectReview()` should collect the existing reports for one resolved scope and pass them into the pure summarizer.

Rationale:

- Existing services already know how to resolve scopes and enforce read-only behavior.
- The summarizer does not need direct repository access.

### 3. Output is a triage report, not a command script

The report should include:

- scope id and generated timestamp
- `sections` for `repo_policy`, `hygiene`, and `export_drafts`
- `reviewItems` with `priority` (`high`, `medium`, `low`) and `source` (`repo_policy`, `hygiene`, `export_drafts`)
- repo policy `health` (`clear`, `attention`, `tripped`)
- summary counts for hygiene findings and export drafts
- recommended review order derived from the highest-risk items
- suggested drill-down commands/resources
- review-only next actions

Rationale:

- Operators need prioritization, not another long dump.
- Suggested actions must stay advisory to avoid bypassing state governance.
- A stable minimal shape keeps CLI, MCP, and tests aligned without requiring a full console model.

### 4. CLI/MCP surfaces mirror existing inspect patterns

Expose:

- `ee inspect review [--cwd <path>] [--limit <n>]`
- `experienceengine://review`
- broker action `inspect_operator_review`

Rationale:

- Keeps the entry discoverable beside other inspect views.
- Gives agents a structured MCP resource and a filterable brokered action.

## Risks / Trade-offs

- [Over-summary hides evidence] -> Include drill-down commands/resources for repo, hygiene, and export drafts.
- [Review flow implies mutation authority] -> Label next actions as review-only and do not include executable mutation payloads.
- [Report becomes too noisy] -> Bound findings/drafts and include only top risks by default.
- [Console scope creep] -> Keep this as a read-only report; defer visual console and team workflows.
