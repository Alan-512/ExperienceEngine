## Why

Real OpenClaw baseline evaluation is now running on the current v3 core, but the results still show two quality problems: shell command text can pollute task classification, and legacy generic strategy nodes can dominate injection during repeated baseline scenarios.

## What Changes

- Strip inline shell/code command spans before task-type classification so repo-root sanity and similar utility checks do not get mislabeled as `test_debug` or `build_debug`
- Add retrieval-time quality penalties for legacy low-specificity nodes so more specific distilled nodes win when both are available
- Re-run the OpenClaw high-confidence scenario pack and capture the updated baseline snapshot after the tuning

## Capabilities

### New Capabilities
- `openclaw-baseline-signal-quality`: Tunes baseline signal quality for task classification and candidate ranking in OpenClaw baseline evaluation

### Modified Capabilities
- `experience-learning-quality`: Task-family resolution and candidate retrieval quality requirements become stricter around command-text stripping and low-specificity node downranking
- `openclaw-scenario-evaluation`: High-confidence scenario evaluation now verifies classification hygiene and node-quality-sensitive retrieval behavior

## Impact

- Affected code: `src/input/tasktype-resolver.ts`, `src/controller/candidate-retriever.ts`, `src/evaluation/openclaw-scenarios.ts`
- Affected tests: task type, candidate retrieval, scenario evaluation
- Affected artifacts: OpenClaw high-confidence evaluation reports
