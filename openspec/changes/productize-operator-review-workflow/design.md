## Context

The current baseline includes read-only reports for repo policy, hygiene, export drafts, and operator review. The operator review report already coordinates the other reports and exposes CLI/MCP drill-down references, but its first implementation is closer to a raw data dump than a workflow.

The product goal for this change is to make the existing read-only review flow useful for repeated operator use while preserving the current safety boundary: no mutation, no automatic export, no console, and no team capability.

## Goals / Non-Goals

**Goals:**

- Make `ee inspect review` readable as an operator workflow, not only a structured dump.
- Keep priority, source, summary, recommended review order, and drill-down commands visible in CLI output.
- Document the workflow in `docs/user-guide.md` with concrete read-only examples.
- Align MCP capability metadata and broker action descriptions with the same workflow language.
- Preserve the stable report shape used by MCP clients.

**Non-Goals:**

- No console, TUI, dashboard, or browser UI.
- No automatic writing to instruction files, skills, docs, or repo config.
- No node lifecycle mutation, repo policy mutation, feedback mutation, backup, import, or rollback.
- No schema migration or ledger rewrite.
- No team or multi-operator workflow.

## Decisions

### Keep The Structured Report Stable

The implementation should not replace `OperatorReviewReport` with presentation-specific text. Instead, the pure report builder may add small presentation-safe fields only if they are useful to both CLI and MCP clients.

Rationale: MCP clients need structured state, while CLI needs readable output. Keeping one structured report avoids a separate text-only workflow model.

Alternative considered: Add a dedicated CLI formatter that computes its own review order and drill-down text. This would duplicate policy logic and increase drift risk.

### Improve CLI Formatting Without Changing Semantics

`ee inspect review` should print a compact workflow:

- scope and generated timestamp
- review-only state statement
- section totals and repo policy health
- recommended review order
- prioritized review items with drill-down commands
- next actions

Rationale: Operators need an ordered checklist more than raw tables alone.

Alternative considered: Print JSON by default. This is better for machines but worse for the fallback operator surface. JSON can be a later optional flag if needed.

### Treat Drill-Down Paths As Advisory

Drill-down references should remain commands/resources to inspect state. They must not imply that the operator should mutate state.

Rationale: This change productizes read-only review; mutation workflows need their own safety model.

### Document Host And CLI Roles Together

The user guide should explain that host MCP resources/actions are preferred when available, and `ee inspect review` remains the explicit CLI fallback.

Rationale: ExperienceEngine should not be described as a separate chat participant, but users still need a clear operator path.

## Risks / Trade-offs

- [Risk] CLI output becomes too verbose for routine use.  
  Mitigation: Keep the default output compact and bounded by the existing limit.

- [Risk] Documentation implies automatic export or mutation.  
  Mitigation: Use explicit review-only wording and show manual drill-down examples only.

- [Risk] MCP and CLI wording drift.  
  Mitigation: Test capability metadata/action descriptions and keep drill-down references in the shared report.

- [Risk] Productization weakens the stable report contract.  
  Mitigation: Extend tests around stable shape and avoid removing existing fields.
