## Why

ExperienceEngine's value depends on learning only execution guidance that can improve future similar coding tasks. The current learning path is too easy to pollute with low-signal successes, expression-only edits, or generic summaries, which weakens future retrieval and injection trust.

## What Changes

- Add a deterministic learning eligibility layer before LLM distillation can create candidates.
- Reject expression-only and insufficient-evidence tasks before they enter the candidate pipeline.
- Accept high-signal learning cases such as failure-repair-success, retry patterns, directional user correction, objective verification changes, repeated task families, reusable error signatures, and verified project execution constraints.
- Persist or expose structured learning rejection reasons so operators can inspect why a task record did not become a candidate.
- Keep host adapter behavior unchanged; this is a core learning-quality change.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `experience-learning-quality`: Learning eligibility becomes an explicit deterministic gate before candidate creation.
- `experience-candidate-distillation`: Distillation only processes candidates that passed learning eligibility.

## Impact

- Affects analyzer, candidate signal construction, runtime finalization learning path, and tests.
- May reduce candidate volume while improving average candidate quality.
- Does not change prompt-time lookup, injection rendering, install/repair behavior, or host hook contracts.
