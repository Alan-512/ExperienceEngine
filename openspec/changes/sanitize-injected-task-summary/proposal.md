## Why

Real OpenClaw finalize payloads currently feed ExperienceEngine's own injected hint block back into the next `task_summary`. That pollutes persisted `trigger_pattern` values, weakens future similarity matching, and makes later node quality drift even when the original user task was clean.

## What Changes

- Sanitize task summaries so ExperienceEngine-authored injected hint blocks are removed before building `ExperienceInput`.
- Apply the sanitization to both prompt normalization and finalize-time persistence paths so replay and real runtime behavior stay aligned.
- Add regression coverage for injected-block stripping and verify that persisted trigger patterns stay anchored to the user task rather than the prepended hint text.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `openclaw-experience-plugin`: Tighten host payload normalization so ExperienceEngine-injected hint blocks are not persisted back into future task summaries or trigger patterns.

## Impact

- Affects prompt normalization and task-summary construction in the OpenClaw plugin runtime.
- Affects analyzer input quality for stored strategy and warning nodes.
- Affects replay coverage and real-runtime validation evidence for persisted `trigger_pattern` values.
