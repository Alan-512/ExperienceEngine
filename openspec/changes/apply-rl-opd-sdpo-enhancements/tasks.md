## 1. Candidate Capture Enhancements

- [x] 1.1 Locate candidate builder logic and add SDPO gate (criticality, improvement room, recoverable path) using existing signals.
- [x] 1.2 Extend candidate evidence payload to include failure signature, retry count, correction signals, and condensed tool-event summary.

## 2. Distillation Prompt + Validation

- [x] 2.1 Update distillation prompt to OPD-style hindsight framing and require structured outputs (`compact_hint`, `trigger_conditions`, `success_criteria`, `risk_level`).
- [x] 2.2 Update distillation output validation to enforce the structured fields and treat invalid output as retryable failure.
- [x] 2.3 Ensure retry/discard logic counts validation failures toward retry exhaustion.

## 3. Tool-Event Summary + Tests

- [x] 3.1 Implement condensed tool-event summary selection for distiller input (failures, repeats, final success, correction-adjacent).
- [x] 3.2 Add/update tests for SDPO gate decisions, distiller input composition, and validation retry/discard behavior.
