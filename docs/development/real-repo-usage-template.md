# Real Repo Usage Template

This document describes the recommended way to use ExperienceEngine on a real repository while continuing to improve the product itself.

The goal is practical product use, not a synthetic demo. A good pass should help you:

- use ExperienceEngine during real coding work
- inspect real interventions
- collect real helped / harmed feedback
- retain enough evidence for benchmark or case-study review

## Recommended Starting Point

For the current product phase, the recommended default path is:

- host: `Codex`
- evaluation mode: `live`

Use OpenClaw and Claude Code as additional host validation surfaces when needed, but use Codex as the primary day-to-day product host unless you are explicitly testing host differences.

## Preconditions

Before starting a real-repo pass:

- the target host CLI already works on the machine
- ExperienceEngine is installed for that host
- `ee doctor <adapter>` reports the adapter as wired and enabled

If the recent change touched runtime behavior, distillation, or intervention logic:

- rerun `pnpm build`
- validate at least one real host session after the build

For Codex:

```bash
ee doctor codex
```

Good signs:

- raw task records are increasing
- task runs are being persisted
- formal nodes already exist after repeated work
- distillation mode is clearly reported

## Recommended Workflow

### 1. Pick a Real Repository

Choose a repository where repeated task families are likely to happen, such as:

- failing tests
- flaky integration work
- migrations and build fixes
- repeated auth or environment issues

Avoid using a toy repo unless the goal is only host wiring validation.

### 2. Work Normally

Start by using the host naturally instead of trying to force ExperienceEngine to trigger.

This gives you:

- real task summaries
- real tool-result traces
- real outcome signals
- realistic intervention opportunities

ExperienceEngine should learn from actual work, not from synthetic prompts alone.

### 3. Inspect the Last Turn

After a meaningful task:

```bash
ee inspect --last
```

Look for:

- intervention decision
- injected nodes
- scorecard
- outcome
- automatic feedback reason

Use this as the default answer for:

- did ExperienceEngine intervene?
- why did it intervene?
- what experience was used?

### 4. Record Explicit Feedback When Needed

When the intervention clearly helped or harmed:

```bash
ee helped
ee harmed
```

Use explicit feedback especially when:

- the result was obviously better because of the injected guidance
- the injected guidance was noisy or misleading
- you want node governance to react faster than automatic attribution alone

### 5. Retain Evaluation Artifacts

When you complete a meaningful pass, keep the generated artifacts for later comparison.

The most useful outputs are:

- benchmark report
- evaluation bundle
- case study
- evidence package

Use these to answer:

- is ExperienceEngine producing net useful interventions in this repo?
- is it improving over time?
- should the repo stay in `live`, or move to `shadow` / `holdout`?

If you want to turn that pass into a reusable write-up, use:

- [docs/development/case-study-template.md](case-study-template.md)

## Suggested Cadence

For a repository you use regularly:

- after important tasks: `ee inspect --last`
- when guidance clearly mattered: `ee helped` or `ee harmed`
- on a regular interval: review benchmark and case-study artifacts

## Good Stop Conditions

Treat a repository as “good enough for current product use” when:

- host integration is stable
- interventions are understandable through `inspect --last`
- explicit feedback is low-friction
- evidence artifacts are being retained for trend comparison

## Things To Avoid

Avoid these anti-patterns:

- forcing synthetic tasks only to manufacture candidates
- treating benchmark artifacts as a substitute for reading real task outcomes
- trying to scale to team/shared registry before single-machine usage is stable

## Minimal Example

For a Codex-centered workflow:

```bash
ee doctor codex
ee inspect --last
ee helped
ee status
```

Use this template as the default starting point, then adapt it to your repository and host.
