## Context

ExperienceEngine v3 core is running with async distillation and OpenClaw-first evaluation. Current candidate capture and distillation prompts are still heuristic. The RL-for-agents literature (SDPO/OPD) provides low-cost guidance for higher-quality candidate selection and better distillation without changing the core architecture or adding new dependencies.

## Goals / Non-Goals

**Goals:**
- Apply SDPO-style critical-segment criteria to candidate capture.
- Switch distillation to OPD-style hindsight guidance with structured inputs.
- Add output validation (is_valid + structural checks) with retry/discard logic.
- Keep OpenClaw-first baseline as the evaluation target.

**Non-Goals:**
- No new model training or RL loops.
- No changes to host adapters beyond consuming new distillation outputs.
- No changes to the async distillation queue architecture.

## Decisions

1. **Candidate capture uses SDPO 3-criteria gate**
   - Criticality (failure signature, retries, corrections), improvement room (failure or success with retries), and recoverable path (successful fix or correction content).
   - This avoids flooding distillation with low-value candidates.

2. **Distiller prompt adopts OPD hindsight framing**
   - The prompt asks what the agent would do differently if it knew one key fact upfront.
   - Outputs must include compact_hint plus structured fields (trigger_conditions, success_criteria, risk_level).

3. **Tool-event summaries are compressed**
   - Only significant events (failures, repeats, final success, correction-adjacent) are fed to distiller.
   - Keeps prompts short and focused without losing signal.

4. **Validation and retry/discard**
   - Distillation output is validated for structure and action-oriented language.
   - Invalid outputs trigger retry; max retries lead to discard.

## Risks / Trade-offs

- [Risk] Over-filtering candidates could reduce learning throughput → Mitigation: keep gate permissive for success-with-retries and correction signals.
- [Risk] Distiller prompt may be too strict and discard useful hints → Mitigation: start with balanced profile and review discard rates in baseline eval.
- [Risk] Structured output drift across models → Mitigation: strict validation and retry; keep schema minimal.

## Migration Plan

- No schema migration beyond existing candidate/distillation fields; re-use existing tables.
- Deploy by updating distiller/candidate builder logic and re-running OpenClaw baseline evaluation.
- Rollback: revert candidate gating and distiller prompt to previous versions.

## Open Questions

- Do we need to add explicit correction detection for non-text signals (tool output patterns)?
- What default retry threshold yields an acceptable discard rate in baseline runs?
