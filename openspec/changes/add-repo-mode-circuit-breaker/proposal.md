## Why

After diagnostic candidates and attribution records exist, ExperienceEngine can start governing intervention aggressiveness at the repository level. The product goal is not to add a console first; it is to keep live guidance production-safe when a repo shows noisy, harmful, or low-trust intervention patterns.

This change adds repo experience modes and a circuit breaker that can tighten diagnostic behavior based on recent attribution and injection evidence.

## What Changes

- Add repo-level experience modes: `safe`, `fast_learning`, and `strict`.
- Add a repo policy read/write model with mode, circuit state, reason, and timestamps.
- Apply repo mode to diagnostic candidate gates.
- Compute circuit breaker state from recent attribution records and injection-event fallback evidence.
- Let users inspect and manually restore repo policy.

## Capabilities

### Added Capabilities

- `experience-repo-policy`: Repo-level policy can adjust intervention aggressiveness and circuit-breaker state from recent evidence.

### Modified Capabilities

- `experience-intervention-governance`: Diagnostic hint delivery becomes constrained by repo policy.
- `experience-attribution-records`: Attribution evidence becomes input to repo-level circuit breaker decisions.

## Impact

- Affected code:
  - `src/types/domain.ts`
  - `src/config/config-schema.ts`
  - `src/store/sqlite/schema.sql`
  - `src/store/sqlite/migrations.ts`
  - `src/store/sqlite/repositories/repo-policy-repo.ts`
  - `src/experience-management/repo-policy.ts`
  - `src/runtime/service.ts`
  - `src/cli/commands/config.ts`
  - `src/interaction/repo-summary.ts`
- Affected tests:
  - `tests/unit/config-command.test.ts`
  - `tests/unit/repo-policy.test.ts`
  - `tests/unit/runtime-service.test.ts`
  - `tests/unit/interaction-service.test.ts`
