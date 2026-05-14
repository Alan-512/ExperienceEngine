## Why

ExperienceEngine now rejects low-value task records before candidate creation, but operators can only inspect individual rejection reasons. That is not enough to tell whether the learner is healthy, overly strict, or admitting generic guidance.

This change adds a lightweight learning-quality observability surface so release validation and day-to-day use can see candidate admission, rejection distribution, generic-advice pressure, and helped/harmed feedback closure without adding a new datastore or dashboard.

## What Changes

- Add scope-level learning-quality metrics derived from existing task run, candidate, node, injection, and attribution records.
- Expose rejection reason distribution, candidate admission rate, generic-advice rejection count, and feedback closure counters through existing status/doctor-style read surfaces.
- Keep metrics read-only and derived; no new lifecycle state, schema migration, or prompt-time behavior change.
- Document follow-up sequencing for Quality Band productization and Operator / Advanced surface consolidation after this release.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `experience-learning-quality`: Learning quality inspection expands from per-task rejection reasons to scope-level observability metrics.
- `cli-user-experience-surface`: Existing status/doctor read surfaces gain concise learning-quality output.

## Impact

- Affected code:
  - `src/interaction/service.ts`
  - `src/store/sqlite/repositories/task-run-repo.ts`
  - `src/cli/commands/status.ts`
  - `src/cli/commands/doctor.ts`
  - related unit tests
- No database schema change.
- No runtime injection or learning admission behavior change.
