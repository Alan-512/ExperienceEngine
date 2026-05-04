## Context

This change is Phase 0 for the refactor. It protects current production behavior before `InterventionStrength`, policy-aware rendering, or diagnostic candidate delivery are introduced.

Current runtime concepts:

- `DeliveryState`: node eligibility (`shadow_only`, `conservative_only`, `eligible`, `quarantined`)
- `EvaluationMode`: run-level delivery experiment (`live`, `shadow`, `holdout`)
- `InjectionMode`: controller action (`skip`, `inject_conservative`, `inject`)
- Scorecard JSON: durable decision diagnostics on injection events

## Goals / Non-Goals

**Goals:**
- Freeze current delivery-state mapping and repository query boundaries.
- Freeze current injection mode decisions for active, priority candidate, candidate, cooling, retired, and quarantined nodes.
- Freeze current live/shadow/holdout behavior.
- Freeze current scorecard JSON shape for existing fields.
- Freeze current renderer and host-summary output shape.

**Non-Goals:**
- Add `InterventionStrength`.
- Change renderer wording.
- Add diagnostic candidate pools.
- Add attribution records, episode projections, database columns, or ledger migrations.
- Rewrite the feedback or node lifecycle state machine.

## Decisions

### 1. Golden tests describe observable behavior

The tests should assert public and durable outputs rather than private implementation details:

- selected node ids and `InjectionMode`
- delivered flag and injected node ids
- scorecard mode, risk, confidence, decision reason, and candidate diagnostics
- renderer titles and conservative hint count
- host-facing summaries that expose scorecard reasoning

### 2. Existing tests can be extended when they already own the behavior

This change does not require a new monolithic test file. It can add targeted golden cases to the existing unit suites that already exercise the controller, runtime service, renderer, MCP server, and node repository.

### 3. Runtime behavior must remain byte-for-byte stable where practical

For prompt text and CLI/MCP summaries, the tests should snapshot or assert stable substrings before Phase 2 changes renderer wording. That gives later changes an explicit place to update expectations.

## Risks / Trade-offs

- [Golden tests become brittle] -> Prefer durable output shape and key strings instead of whole-object snapshots unless the output is intentionally stable.
- [Coverage misses host lifecycle behavior] -> Include both runtime service persistence and Codex MCP scorecard summary tests.
- [Later phases treat Phase 0 as optional] -> Add explicit dependency language in Phase 1 tasks.

## Implementation Plan

1. Add controller golden tests for delivery-state to injection-mode mapping.
2. Add repository golden tests for exact-scope live, exact-scope shadow, and conservative cross-scope pools.
3. Add runtime golden tests for live, shadow, and holdout persistence.
4. Add renderer golden tests for current generic and conservative prompt titles.
5. Add interaction/Codex MCP tests for current scorecard summary fields.
6. Run targeted unit tests and full typecheck.
