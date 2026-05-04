## Why

ExperienceEngine currently has separate runtime concepts for node delivery eligibility, live/shadow/holdout evaluation, and injection action. The revised refactor plan adds a fourth concept: the meaning and strength of the guidance shown to the host agent.

That concept must not be named `DeliveryMode`, because `DeliveryState` and `EvaluationMode` already carry delivery semantics in the current code. Without a distinct model, future diagnostic hints would risk mixing "can this node ship", "was this run held out", and "how should the agent treat this prompt text".

## What Changes

- Depends on `freeze-current-intervention-governance`.
- Add an `InterventionStrength` domain type for prompt-strength semantics:
  - `diagnostic_hint`
  - `soft_recommendation`
  - `strong_recommendation`
  - `hard_constraint`
- Persist the selected strength in intervention diagnostics and injection scorecards.
- Preserve current `DeliveryState`, `EvaluationMode`, and `InjectionMode` behavior.
- Keep live delivery behavior unchanged in this change.

## Capabilities

### New Capabilities

- `experience-intervention-governance`: Prompt guidance carries an explicit strength separate from delivery eligibility and evaluation mode.

### Modified Capabilities

- `openclaw-experience-plugin`: Runtime intervention decisions may now expose strength in scorecards while keeping delivery behavior stable.
- `codex-runtime-loop`: Codex summaries may include strength when scorecards are returned.

## Impact

- Affected code:
  - `src/types/domain.ts`
  - `src/controller/intervention-controller.ts`
  - `src/controller/injection-scorecard.ts`
  - `src/runtime/service.ts`
  - `src/interaction/service.ts`
  - `src/adapters/codex/mcp-server.ts`
- Affected tests:
  - `tests/unit/intervention-controller.test.ts`
  - `tests/unit/runtime-service.test.ts`
  - `tests/unit/inspect-command.test.ts`
  - `tests/unit/codex-mcp-server.test.ts`
