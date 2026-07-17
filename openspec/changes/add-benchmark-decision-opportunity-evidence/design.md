## Context

The current scorer receives one aggregate observation per block/arm and assumes `decision_opportunity_count=1`. Correct-skip validity depends on plausible-candidate consideration and stable rejection evidence that the aggregate type does not retain. Harm-recovery will later require more than one opportunity in one formal task trial.

## Decisions

### 1. Preserve v1 observations

Legacy observations remain valid only as one-opportunity records. Existing v1 campaign reports must score unchanged.

### 2. Add a v2 opportunity array

V2 arm observations carry exact opportunity records and aggregate counters. The scorer verifies that aggregate decision, delivery, outcome, and opportunity counts equal the opportunity array.

### 3. Version ground truth, not storage tables

The append-only campaign store already persists canonical JSON. Ground-truth v2 adds a predeclared decision sequence without changing benchmark table ownership or mutable runtime schema.

### 4. Correct skip is evidence-backed

A correct skip requires an intersection between declared plausible ids and observed considered/selected/rejected ids, a stable reason code, successful deterministic checks, and no evidence that skipped guidance was required.

### 5. Confusion is opportunity-level

The treatment confusion matrix and skip metrics count decision opportunities. Task-success, latency, tool-call, token, and cost deltas remain task-trial/block measures.

## Non-Goals

- Running the real OpenClaw scenarios.
- Defining harm-recovery governance semantics.
- Changing the three required arms.
- Changing runtime injection or node lifecycle authority.

## Acceptance

- V1 scoring regression remains byte/digest stable for unchanged inputs.
- V2 rejects aggregate mismatches, duplicate opportunity ids, unknown opportunity ids, empty-retrieval correct skips, and missing stable reasons.
- V2 computes correct-skip and false-positive metrics from opportunity records.

