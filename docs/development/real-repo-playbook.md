# Real Repo Playbook

This page is the shortest entry point for using ExperienceEngine on real repositories.

If you do not want to read every development document, start here.

## What This Playbook Is For

Use this playbook when you want to:

- use ExperienceEngine during real coding work
- choose the right repository for a pass
- decide which compiler target to use
- turn a real run into a case study

It is not a host wiring checklist. It is a practical operating path.

## Recommended Default Path

For the current product phase, the default recommendation is:

1. use `Codex` as the primary real product host
2. start with a real repository that has repeated verification or debugging work
3. use `ee inspect --last` and `ee helped` / `ee harmed`
4. only promote stable patterns into Packs
5. compile and deploy conservatively
6. retain evidence artifacts for later comparison

## Read In This Order

### 1. Real usage workflow

Start here:

- [Real Repo Usage Template](./real-repo-usage-template.md)

This tells you the practical end-to-end flow:

- work normally
- inspect
- feedback
- pack
- compile
- deploy
- retain evidence

### 2. Pick the right compiler target

Then read:

- [Compiler Target Selection Guide](./compiler-target-selection-guide.md)

Use it to decide between:

- `agents`
- `codex`
- `claude`
- `github`

### 3. Turn a pass into a stable write-up

Then use:

- [Case Study Template](./case-study-template.md)

Use this when you want a repository pass to become something reviewable and reusable.

## Current Example Case Studies

### A. Mature self-hosted usage

- [ExperienceEngine Self-Hosted Case Study](./experienceengine-self-hosted-case-study.md)

Use this to understand:

- what a more mature repeated-task repository looks like
- what healthy intervention evidence looks like
- how runtime learning differs from Pack-driven reuse

### B. External cold-start usage

- [External Repo Cold Start on `function-master-plot`](./function-plotter-cold-start-case-study.md)

Use this to understand:

- what a real external cold-start case looks like
- why host success does not automatically mean durable experience capture
- what kinds of environment friction are worth documenting early

## Which Repository Type To Choose

### Choose a mature repeated-task repository when you want to test:

- whether interventions produce net helpful value
- whether a Pack is ready to publish
- whether compiled host-facing artifacts are worth deploying

### Choose a cold-start external repository when you want to test:

- first-value readiness
- host/runtime friction
- whether repeated real tasks begin to accumulate durable scope-local evidence

## Practical Rule

If you are unsure what to do next:

1. run a real task in a real repo
2. inspect the last turn
3. record explicit feedback if it clearly helped or harmed
4. do not publish a Pack until the usefulness pattern is obvious
5. preserve evidence before making broader product claims

## Related Documents

- [ExperienceEngine User Guide](../user-guide.md)
- [Codex Runtime Validation](./codex-runtime-validation.md)
- [Codex Runtime Validation Checklist](./codex-runtime-validation-checklist.md)
- [OpenClaw Runtime Validation](./openclaw-runtime-validation.md)
