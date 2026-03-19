# Case Study: ExperienceEngine On Itself

## Context

- Repository: `ExperienceEngine`
- Primary hosts exercised in this phase:
  - `Codex` for day-to-day real product use
  - `OpenClaw` for strict baseline and scenario evaluation
- Date range:
  - primary evidence from `2026-03-17` to `2026-03-19`
- Primary task families:
  - `build_debug`
  - `test_debug`
  - repeated repository verification work

Why ExperienceEngine was relevant here:

- the repository repeatedly runs the same verification tasks during active development
- the same debugging and validation patterns appear across multiple sessions
- this makes it a good self-hosted environment for testing whether experience intervention produces net value instead of extra prompt noise

## Initial State

At the start of this pass:

- ExperienceEngine was already wired into `Codex`, `Claude Code`, and `OpenClaw`
- the core learning loop was functioning, but product work was still focused on making the outputs more reusable:
  - Experience Pack
  - compiler targets
  - deploy/status visibility
- repeated validation tasks in the repository created a realistic stream of similar build/test work

This made the repository a good fit for testing two things at once:

1. whether interventions stayed useful during active development
2. whether the resulting experience could be promoted into reusable assets

## ExperienceEngine Usage

This pass used ExperienceEngine in the repository itself rather than in a synthetic demo repo.

Main surfaces used:

- `ee doctor codex`
- `ee inspect --last`
- `ee helped`
- OpenClaw baseline and high-confidence scenario evaluation

Evidence-bearing artifacts were generated through the evaluation pipeline:

- benchmark report
- evaluation bundle
- case study
- evidence package

No published Pack was active in the current Codex scope at the time of the latest doctor snapshot:

- `Enabled packs: 0`
- `Published packs: 0`
- `Compiled targets: 0`

That means the observed behavior in this case study primarily reflects the runtime learning loop itself, not a Pack-controlled deployment.

## Evidence Summary

### Codex current runtime snapshot

From `ee doctor codex` on `2026-03-19`:

- `Distillation mode: llm`
- `Distillation source: host_mediated`
- `Host LLM mode: mediated`
- `Evaluation mode: live`
- `Holdout rate: 0.2`
- `Raw task records: 132`
- `Task runs: 25`
- `Formal experience nodes: 18`

This indicates that the repository is no longer in a cold-start state. ExperienceEngine is operating with durable experience already present.

### Latest observed intervention

From `ee inspect --last`:

- task family: `build_debug`
- intervention: `inject`
- automatic feedback: `helped`
- automatic feedback reason: `success_outcome`
- injected nodes: `3`
- scorecard risk: `medium`
- recommendation: use hints selectively and confirm with focused verification

Why it matched:

- exact task-family match
- nodes already active and above the evidence threshold

### OpenClaw high-confidence scenario evidence

From:

- [real-high-confidence-postfix-3/case-study.md](../../artifacts/evaluations/openclaw/real-high-confidence-postfix-3/case-study.md)

Observed outcome:

- `Verdict: healthy`
- `Delivery rate: 1`
- `Helpful rate: 1`
- `Harmful rate: 0`
- `Net helpful rate: 1`
- `Suggested mode: live`

Mode comparison:

- `live: decisions=4 delivered=4 suppressed=0 helpful=4 harmed=0 net=1 verdict=healthy`

This is the clearest current evidence that the repository can sustain repeated intervention without degrading into noisy retrieval.

## What Helped

Three things were clearly valuable in this pass:

1. Repeated build/test verification tasks produced reusable strategy nodes instead of only one-off session context.
2. `ee inspect --last` made intervention reasons and node provenance visible enough to judge whether the guidance was legitimate.
3. The OpenClaw scenario outputs gave a stable benchmark surface that could be compared over time instead of relying on subjective impressions.

In practice, the useful pattern was not “more memory.” It was:

- detect recurring verification work
- inject a small amount of already-proven guidance
- confirm the result quickly
- keep or retire the experience based on evidence

## What Caused Friction

The main friction observed in this case study was not runtime correctness. It was product-shape friction:

- most durable evidence still lives in generated artifacts and CLI output rather than a dedicated review UI
- Pack publication and compiler/deploy flows now exist, but they were not yet the main mechanism driving the latest Codex scope
- the current scope had no published Pack enabled, so this pass mostly validated runtime learning rather than packaged reuse

This means the runtime loop is ahead of the asset adoption loop.

## Decision

Current decision for this repository:

- keep `live` mode
- continue using `Codex` as the primary real product host
- continue collecting explicit feedback through `ee inspect --last` and `ee helped` / `ee harmed`
- start promoting stable node clusters into Packs only when the task family is clearly recurring
- treat OpenClaw scenario artifacts as the stricter benchmark signal for whether intervention quality remains healthy

## Linked Artifacts

Primary artifact set used for this case study:

- [OpenClaw high-confidence case study](../../artifacts/evaluations/openclaw/real-high-confidence-postfix-3/case-study.md)
- [OpenClaw high-confidence benchmark report](../../artifacts/evaluations/openclaw/real-high-confidence-postfix-3/benchmark-report.md)
- [OpenClaw high-confidence evidence package](../../artifacts/evaluations/openclaw/real-high-confidence-postfix-3/evidence-package.md)
- [OpenClaw high-confidence evaluation bundle](../../artifacts/evaluations/openclaw/real-high-confidence-postfix-3/evaluation-bundle.md)
- [Codex runtime validation](./codex-runtime-validation.md)
- [Codex runtime validation checklist](./codex-runtime-validation-checklist.md)
