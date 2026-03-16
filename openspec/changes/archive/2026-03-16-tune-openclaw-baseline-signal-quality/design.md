## Context

OpenClaw baseline evaluation is finally exercising the latest candidate-first async distillation core. The latest high-confidence pack showed that the learning loop is functioning, but also revealed two issues that distort the baseline:

- repo sanity prompts include backticked shell commands like `test -f`, which trigger narrow task matchers and misclassify the run as `test_debug`
- older generic strategy nodes such as "Reproduce first, then validate the fix..." still outrank newer, more specific distilled nodes

These are not host-integration bugs. They are signal-quality issues in the core classification and retrieval layers.

## Goals / Non-Goals

**Goals:**
- Prevent inline shell command text from biasing task-type classification
- Downrank low-specificity legacy nodes during retrieval without deleting historical data
- Re-run the OpenClaw high-confidence pack and verify the tuned behavior in real baseline output

**Non-Goals:**
- Introduce a new retrieval architecture
- Delete or migrate historical nodes in this change
- Change Claude/Codex behavior beyond inheriting shared core improvements

## Decisions

1. Strip command/code spans before task classification
   - We will classify against a sanitized natural-language summary with inline code spans removed, while preserving the original full summary elsewhere
   - This keeps the resolver focused on user intent instead of shell command tokens

2. Penalize low-specificity legacy nodes instead of removing them
   - Retrieval will compute a lightweight specificity score from hint structure and known legacy template patterns
   - Generic hints remain available as fallback evidence but should lose to specific distilled nodes when semantic scores are close

3. Use the existing OpenClaw high-confidence pack as the acceptance harness
   - The same scenario pack already proved useful at exposing regressions
   - We will validate the tuning by regenerating the real baseline report rather than inventing a new synthetic-only harness

## Risks / Trade-offs

- [Risk] Stripping code spans may hide legitimate classification cues for some prompts
  → Mitigation: only remove explicit inline command spans/backticks, not surrounding narrative text

- [Risk] Over-penalizing generic nodes could suppress useful fallback advice in cold-start cases
  → Mitigation: apply a bounded quality penalty instead of hard filtering, and keep semantic/task-family gating intact

- [Risk] Real OpenClaw scenario runs remain slow and can add iteration time
  → Mitigation: keep the scenario pack small and focused on the existing high-confidence set
