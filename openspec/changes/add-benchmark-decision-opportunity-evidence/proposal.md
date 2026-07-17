## Why

The accepted matched-block implementation records one aggregate decision per arm. That is sufficient for the retained v4 inject scenario but cannot prove a valid correct skip or represent more than one decision opportunity inside a task trial. Phase 0.5C requires opportunity-level evidence while preserving all immutable v1-v4 records.

## What Changes

- Add a versioned decision-opportunity ground-truth sequence.
- Add strict opportunity-level arm observations with candidate consideration, stable skip reasons, delivery, task checks, and immutable digests.
- Score delivery, confusion-matrix, correct-skip, and false-positive metrics per opportunity.
- Preserve task-trial pairwise deltas and v1 single-opportunity compatibility.
- Reject empty retrievals and missing candidate evidence as correct skips.

## Capabilities

- `matched-block-benchmark-evidence`: Versioned multi-opportunity evidence and correct-skip scoring.

## Impact

- `src/evaluation/matched-block/*`
- matched-block campaign report parsing and tests
- no runtime authority or host installation behavior

