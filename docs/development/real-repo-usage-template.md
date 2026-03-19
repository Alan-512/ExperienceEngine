# Real Repo Usage Template

This document describes the recommended way to use ExperienceEngine on a real repository while continuing to improve the product itself.

The goal is practical product use, not a synthetic demo. A good pass should help you:

- use ExperienceEngine during real coding work
- inspect real interventions
- collect real helped / harmed feedback
- package stable experience into Packs
- compile and deploy reviewed host-facing assets
- retain enough evidence for benchmark or case-study review

## Recommended Starting Point

For the current product phase, the recommended default path is:

- host: `Codex`
- evaluation mode: `live`
- pack/compiler/deploy workflow: local-only

Use OpenClaw and Claude Code as additional host validation surfaces when needed, but use Codex as the primary day-to-day product host unless you are explicitly testing host differences.

## Preconditions

Before starting a real-repo pass:

- the target host CLI already works on the machine
- ExperienceEngine is installed for that host
- `ee doctor <adapter>` reports the adapter as wired and enabled

If the recent change touched runtime behavior, distillation, pack flow, compiler, or deploy logic:

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
- active / matched packs

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

### 5. Promote Stable Experience into a Pack

Once a group of nodes looks stable and reusable:

```bash
ee pack draft create <pack-id> <node-id[,node-id...]>
ee pack review <pack-id> <description...>
ee pack publish <pack-id>
```

Only package reviewed, reusable experience. Do not package every node just because it exists.

Good Pack candidates usually have:

- clear task-family focus
- evidence of repeated usefulness
- low harm history
- guidance that still makes sense outside one single session

### 6. Compile the Pack

Choose the host-facing target you actually need:

```bash
ee pack compile <pack-id>
ee pack compile <pack-id> codex
ee pack compile <pack-id> claude
ee pack compile <pack-id> github
```

Current targets:

- `agents` -> `AGENTS.md`
- `codex` -> `CODEX.md`
- `claude` -> `CLAUDE.md`
- `github` -> GitHub agent profile markdown

### 7. Check Deploy Status Before Writing

Inspect the destination first:

```bash
ee pack status <pack-id> agents /path/to/repo
ee pack status <pack-id> codex /path/to/repo
ee pack status <pack-id> claude /path/to/repo
ee pack status <pack-id> github /path/to/repo
```

Expected states:

- `missing`
- `up_to_date`
- `drifted`

### 8. Deploy Conservatively

Use `--dry-run` first:

```bash
ee pack deploy <pack-id> agents /path/to/repo --dry-run
```

Then deploy for real:

```bash
ee pack deploy <pack-id> agents /path/to/repo
```

Only use `--force` when you intentionally want to overwrite a drifted target.

### 9. Retain Evaluation Artifacts

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
- after a cluster of repeated work: review nodes for a Pack
- after Pack publication: compile and optionally deploy
- on a regular interval: review benchmark and case-study artifacts

## Good Stop Conditions

Treat a repository as “good enough for current product use” when:

- host integration is stable
- interventions are understandable through `inspect --last`
- explicit feedback is low-friction
- at least one reviewed Pack has been published
- at least one host-facing artifact has been compiled and checked
- evidence artifacts are being retained for trend comparison

## Things To Avoid

Avoid these anti-patterns:

- forcing synthetic tasks only to manufacture candidates
- publishing Packs before nodes show stable usefulness
- deploying compiled files with `--force` as the first step
- treating benchmark artifacts as a substitute for reading real task outcomes
- trying to scale to team/shared registry before single-machine usage is stable

## Minimal Example

For a Codex-centered workflow:

```bash
ee doctor codex
ee inspect --last
ee helped
ee pack draft create auth-debug-pack node_a,node_b,node_c
ee pack review auth-debug-pack "Auth test repair guidance for repeated failures"
ee pack publish auth-debug-pack
ee pack compile auth-debug-pack codex
ee pack status auth-debug-pack codex /path/to/repo
ee pack deploy auth-debug-pack codex /path/to/repo --dry-run
ee pack deploy auth-debug-pack codex /path/to/repo
```

Use this template as the default starting point, then adapt it to your repository and host.
