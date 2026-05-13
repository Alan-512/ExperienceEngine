## 1. Reason Model

- [x] 1.1 Define stable skip reason codes using existing intervention and retrieval diagnostics
- [x] 1.2 Add tests for representative skip reasons: no candidate, candidate immature, policy rejected, recent harm, holdout suppressed
- [x] 1.3 Define an ordered primary-reason precedence table for overlapping skip causes
- [x] 1.4 Add tests for overlapping cases such as scope disabled plus no candidate, holdout plus eligible candidate, and recent harm plus semantic match

## 2. Decision Wiring

- [x] 2.1 Add skip reason derivation to intervention scorecard or adjacent diagnostic model
- [x] 2.2 Ensure delivered injection behavior is unchanged
- [x] 2.3 Persist or expose the reason with the existing injection event/scorecard path
- [x] 2.4 Reconcile reason codes with the final `tighten-injection-policy` gates before implementation is considered complete

## 3. Interaction Surface

- [x] 3.1 Update inspect/explain surfaces to render concise no-injection explanations
- [x] 3.2 Keep default prompt injection output unchanged for skip decisions

## 4. Validation

- [x] 4.1 Run intervention and interaction-service tests
- [x] 4.2 Run `pnpm check`
- [x] 4.3 Run `openspec validate --changes --strict`
