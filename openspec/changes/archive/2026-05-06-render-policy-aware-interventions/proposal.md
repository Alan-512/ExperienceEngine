## Why

ExperienceEngine already records risk, confidence, and decision diagnostics, but the prompt text currently uses broad labels such as `Execution hints from prior similar tasks` and `Conservative execution hints`. That wording does not tell the host agent whether a hint is a diagnostic lead, a soft recommendation, a validated recommendation, or a constraint.

After `InterventionStrength` exists, the controller should pass the derived strength to the renderer and also persist it in scorecards. The renderer should translate that controller-derived strength into compact policy language that guides how the agent should use the prior experience.

## What Changes

- Update the injection renderer to accept `InterventionStrength`.
- Render distinct titles and usage instructions for:
  - `diagnostic_hint`
  - `soft_recommendation`
  - `strong_recommendation`
  - `hard_constraint`
- Keep prompt text compact and avoid dumping full scorecards into context.
- Preserve existing fallback rendering when strength is absent.

## Capabilities

### Modified Capabilities

- `experience-intervention-governance`: Delivered guidance becomes policy-aware and communicates how strongly the agent should apply it.
- `openclaw-experience-plugin`: Prompt-time injected context carries clearer usage semantics.
- `claude-runtime-validation`: Claude prompt-time injected context inherits the same renderer semantics.
- `codex-runtime-loop`: Codex lookup text inherits the same renderer semantics.

## Impact

- Affected code:
  - `src/controller/injection-renderer.ts`
  - `src/controller/intervention-controller.ts`
  - `src/runtime/service.ts`
- Affected tests:
  - `tests/unit/injection-renderer.test.ts`
  - `tests/unit/intervention-controller.test.ts`
  - `tests/unit/runtime-service.test.ts`
  - `tests/integration/plugin-runtime.test.ts`
