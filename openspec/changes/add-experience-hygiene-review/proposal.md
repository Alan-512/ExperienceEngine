## Why

ExperienceEngine now has attribution, episode projection, repo policy, and policy inspection surfaces. The next product need is to help operators find stale, duplicate, conflicting, or over-generalized learned guidance before it keeps influencing future tasks.

## What Changes

- Add an experience hygiene review capability that reports candidate/node quality issues.
- Detect stale experiences, duplicate guidance, conflicting guidance, over-generalized hints, and evidence drift.
- Surface hygiene findings through interaction and CLI inspect/report surfaces.
- Provide recommendations only; do not auto-delete, auto-merge, auto-retire, or auto-quarantine in this change.
- Keep export drafts, team workflows, and richer console UI out of scope.

## Capabilities

### New Capabilities

- `experience-hygiene-review`: Read-only hygiene review reports for learned experience quality issues.

### Modified Capabilities

- None. Hygiene findings are a separate operator review surface and do not change learning, delivery, or lifecycle behavior by themselves.

## Impact

- Affected code:
  - `src/maintenance/experience-hygiene.ts`
  - `src/interaction/service.ts`
  - `src/cli/commands/inspect.ts`
  - `src/store/sqlite/repositories/node-repo.ts` if additional read queries are needed
  - `src/store/sqlite/repositories/candidate-repo.ts` if additional read queries are needed
- Affected tests:
  - `tests/unit/experience-hygiene.test.ts`
  - `tests/unit/interaction-service.test.ts`
  - `tests/unit/inspect-command.test.ts`
