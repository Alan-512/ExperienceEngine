## Why

ExperienceEngine's v3 core is running, but candidate capture and distillation still rely on broad rule heuristics and summary-style prompts. The RL-for-agents literature (SDPO/OPD) provides concrete, low-cost guidance to improve candidate selection and distillation quality without changing the core architecture.

## What Changes

- Tighten candidate capture with SDPO-inspired “critical segment” rules (criticality, improvement room, recoverable path).
- Replace the distiller prompt with OPD-style hindsight guidance ("if the agent knew X earlier, what would it do differently?").
- Add structured distillation inputs (retry count, correction signals, failure signature, condensed tool-event summary).
- Add output validation and retry/discard rules for low-quality distillation.

## Capabilities

### New Capabilities
- _None._

### Modified Capabilities
- `experience-candidate-distillation`: Candidate -> distill pipeline gains SDPO capture gates and OPD hindsight prompt/validation.
- `experience-learning-quality`: Experience extraction and learning quality requirements add hindsight-focused guidance and candidate gating signals.

## Impact

- Affected code: candidate builder, distillation prompt, distillation validator, tool-event summary logic.
- Affected tests: candidate capture, distiller input/output validation, OpenClaw baseline evaluation.
- No new external dependencies required.
