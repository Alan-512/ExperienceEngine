## Why

The refactor plan depends on preserving ExperienceEngine's current production-safe governance behavior before adding new prompt-strength or diagnostic-candidate paths.

The current code already has separate concepts for node delivery eligibility, run-level evaluation mode, controller injection action, scorecard persistence, and host lifecycle handling. Those behaviors need golden tests before Phase 1 changes the domain model.

## What Changes

- Add golden tests that freeze current intervention governance behavior.
- Cover delivery-state mapping, live/shadow/holdout evaluation behavior, injection mode decisions, scorecard persistence, renderer output shape, and host lifecycle summaries.
- Do not add product behavior, new state values, new database columns, or new prompt wording.
- Make later OpenSpec changes depend on these tests as the baseline contract.

## Capabilities

### New Capabilities

- `experience-intervention-governance`: Current delivery-state gating, evaluation-mode handling, injection mode decisions, and scorecard persistence are protected by regression tests before semantic refactors begin.

### Modified Capabilities

- `openclaw-experience-plugin`: Existing intervention behavior receives broader golden-test coverage without changing runtime output.
- `codex-runtime-loop`: Existing scorecard and lifecycle summary behavior receives regression coverage without changing MCP output.

## Impact

- Affected code:
  - tests only
- Affected tests:
  - `tests/unit/intervention-controller.test.ts`
  - `tests/unit/injection-renderer.test.ts`
  - `tests/unit/runtime-service.test.ts`
  - `tests/unit/interaction-service.test.ts`
  - `tests/unit/codex-mcp-server.test.ts`
  - `tests/unit/node-repo.test.ts`
