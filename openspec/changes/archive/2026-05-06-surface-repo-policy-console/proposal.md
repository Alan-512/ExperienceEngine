## Why

Phase 6 added repo policy and circuit-breaker behavior, but the current operator surface only exposes a compact policy snapshot. Before adding broader hygiene or export workflows, operators need a concrete way to inspect why a repo is in `safe`, `fast_learning`, or `strict`, what evidence tripped the circuit, and what restore would change.

## What Changes

- Add a repo policy inspection surface that shows configured mode, effective mode, circuit state, diagnostic suppression, timestamps, and reason.
- Add recent circuit evidence details from attribution records and fallback injection events.
- Add clear restore guidance and keep the existing manual restore path explicit.
- Surface this through existing CLI/interaction surfaces before any richer console UI.
- Do not add hygiene jobs, export drafts, team policy, or automatic cleanup in this change.

## Capabilities

### New Capabilities

- `repo-policy-console`: Operator-facing repo policy and circuit-breaker inspection.

### Modified Capabilities

- `experience-repo-policy`: Repo policy inspection becomes evidence-aware instead of only reporting state fields.

## Impact

- Affected code:
  - `src/interaction/service.ts`
  - `src/interaction/repo-summary.ts`
  - `src/cli/commands/inspect.ts`
  - `src/cli/commands/config.ts` if restore/help wording needs alignment
  - `src/store/sqlite/repositories/attribution-record-repo.ts`
  - `src/store/sqlite/repositories/injection-repo.ts`
- Affected tests:
  - `tests/unit/inspect-command.test.ts`
  - `tests/unit/interaction-service.test.ts`
  - `tests/unit/repo-policy.test.ts`

