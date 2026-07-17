## Context

The current runner is intentionally specialized to one seeded file-write inject scenario. Copying it per scenario would duplicate host setup, arm isolation, formal-start ordering, and evidence logic. The next runner must separate common OpenClaw execution from scenario-specific fixture, task sequence, and validation adapters.

## Decisions

### 1. New campaign only

The runner creates a new campaign id, protocol version, scenario set, output root, database, observations, and evidence record. It does not open v1-v4 databases for mutation.

### 2. Common host adapter, sealed scenario adapters

Common code owns install, config, auth-copy isolation, arm environment, preflight, formal attempts, external observers, and cleanup. Scenario adapters own candidate corpus, opportunity sequence, deterministic checks, and scenario-specific evidence extraction.

### 3. Independent validator

The validator reads the exact campaign database, observations, retained runtime artifacts, and evidence record. It recomputes digests and scorecards and rejects missing candidate/session/governance/no-EE evidence.

### 4. Pilot before publication claim

The first real multi-scenario run is an infrastructure/directional pilot. A publishable general claim requires a separately sealed repetition and scenario-cluster plan.

## Acceptance

- Every scenario completes a full three-arm block or receives an immutable disposition/replacement.
- Correct skip proves plausible-candidate consideration.
- Harm recovery proves actual treatment harm and production-governed suppression.
- The final record states scenario/repetition limitations and keeps support/readiness false.

