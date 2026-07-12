## Why

The future package-local runtime needs one supervisor and one production worker authority per ExperienceEngine home. Process presence, PID files, heartbeats, WAL locks, or successful child spawn cannot provide that authority. Phase 0.5A.1 freezes explicit launch authorization, launch-attempt identity, supervisor lease, worker lease, monotonic fencing, and lifecycle terminalization.

This third slice depends on `establish-runtime-package-home-identity` and `add-runtime-schema-migration-authority`. It establishes process authority only. A valid lease still does not authorize production semantic writes before the later production-activation slice.

## What Changes

- Add immutable launch-authorization issuance identity and separate mutable authorization-row state revision.
- Add atomic authorization consumption and one-attempt reservation with revisioned child-process identity binding before supervisor lease acquisition.
- Add one objective `fresh_supervisor_authority` predicate derived only from authoritative database evidence.
- Add atomic supervisor lease acquisition, renewal, graceful release, verified process-exit revocation, natural expiry, and matching launch-attempt terminalization.
- Add singleton worker lease acquisition/takeover with monotonic fencing.
- Add bounded restart, drain, orphan, parent-death, and stale-owner behavior.
- Keep production queue claims and semantic completion disabled until `add-openclaw-production-activation` defines current production authority.

## Capabilities

### New Capabilities

- `runtime-process-authority`: Launch authorization, launch attempt, child binding, supervisor lease, worker lease, lifecycle, and fencing authority for one package-local runtime per canonical home.

## Impact

- Expected code areas: package-local supervisor/worker entrypoints, process spawning, process identity probes, SQLite repositories, lifecycle runtime, gateway service integration seams, status/doctor projection, and tests.
- Expected persisted concepts: launch authorization, launch attempt, child binding revision, supervisor lease epoch/state revision, worker fencing token/state revision, restart budget, drain/shutdown request, and terminal evidence.
- Dependencies: `establish-runtime-package-home-identity`, `add-runtime-schema-migration-authority`.
- Held closed until: production activation is implemented in `add-openclaw-production-activation`.
- This slice does not by itself make learning runtime active.
