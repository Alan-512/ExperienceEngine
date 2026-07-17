## Why

Deterministic contracts are not enough to close Phase 0.5C. The exact OpenClaw host path must execute a new sealed campaign containing inject, correct-skip, and harm-recovery scenarios without mutating retained v1-v4 evidence.

## What Changes

- Refactor the existing real-host pilot into scenario adapters without changing the historical single-scenario CLI/report label.
- Seal a new multi-scenario campaign and complete full three-arm blocks.
- Independently validate session binding, candidate consideration, skip reasons, delivery, harm attribution, governance transition, and no-EE absence.
- Publish a durable limitations record while preserving support/readiness flags.

## Capabilities

- `matched-block-benchmark-evidence`: Exact OpenClaw multi-scenario validation.

## Dependencies

- `add-benchmark-decision-opportunity-evidence`
- `add-benchmark-harm-recovery-scenarios`

