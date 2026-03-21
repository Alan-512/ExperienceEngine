# Case Study: External Repo Cold Start on `function-master-plot`

## Context

- Repository: `function-master-plot`
- Local path used during this pass: `/mnt/d/project/函数绘图`
- Host used: `Codex`
- Repository commit during the pass: `a7b85eb`
- Date: `2026-03-19`
- Primary task family exercised:
  - read-only repository verification
  - plotting test execution

Why this repository was useful:

- it is a real external repository, not the ExperienceEngine repo itself
- it includes an executable read-only plotting test workflow
- its path includes non-ASCII characters, which exposed a host/runtime edge case during validation

## Initial State

At the start of the pass:

- `ExperienceEngine` was already installed for `Codex`
- `ee doctor codex` from this repository reported:
  - adapter installed and enabled
  - `distillation mode = llm`
  - `source = explicit_provider`
  - `evaluation mode = live`
- current scope state for this repository:
  - `Scope: scope_05bdb507d983`
  - `Enabled packs: 0`
  - `Published packs: 0`
  - `Compiled targets: 0`

Most importantly, this repository had not yet accumulated durable ExperienceEngine history for its own scope:

- no `task_runs`
- no `outcome_records`
- no `review_events`
- no `experience_input_records`

This makes it a real cold-start / first-value case rather than a mature repeated-task case.

## What Was Run

A real non-interactive `Codex` host session was executed against this repository with a read-only prompt:

- first run `pwd`
- then run `npm run test:plotting`
- report whether the plotting suite passed

The host completed the task successfully.

Observed result from the real session:

- `pwd` returned `/mnt/d/project/函数绘图`
- `npm run test:plotting` exited with code `0`
- reported checks included:
  - `Plot smoke tests passed`
  - `Implicit pipeline tests passed`
  - `Keyboard combo coverage passed`
  - `Worker eval coverage passed`
  - `OCR parse coverage passed`
  - `OCR candidate selection passed`
  - `Plot performance policy tests passed`

## Host Friction Observed

During this same pass, `Codex` logged repeated WebSocket connection failures before falling back to HTTPS transport.

The visible error was:

- UTF-8 conversion failure in the `x-codex-turn-metadata` header
- the failing workspace path embedded in that metadata contained the non-ASCII directory name `函数绘图`

Practical meaning:

- the host task still succeeded
- but the repository path created a real transport-level friction point for Codex
- this is a host/runtime limitation worth tracking when using ExperienceEngine on repositories with non-ASCII paths

## ExperienceEngine Evidence

This pass is valuable because of what it did **not** yet produce.

After the external-repo run, the repository scope still had:

- no `task_runs`
- no `outcome_records`
- no `review_events`
- no `experience_input_records`

That means this pass did **not** yet create a durable ExperienceEngine learning trace for the external repository scope.

The latest `ee inspect --last` output remained pointed at the most recent ExperienceEngine repository evaluation record rather than this external repository.

## What This Case Proves

This is not a “healthy mature intervention” case. It is a **cold-start friction** case.

It proves:

1. `Codex` can still complete a real read-only task in this external repository.
2. A repository path containing non-ASCII characters can introduce real host transport instability before fallback.
3. A successful host task does not automatically mean ExperienceEngine has already produced durable scope-local evidence for that repository.

In other words:

- host success is not the same as experience capture success
- cold-start value should be judged separately from wiring success

## What Helped

The most useful part of this pass was diagnostic clarity:

- `ee doctor codex` immediately showed that the repository was wired but still cold from a Pack/asset perspective
- the host run exposed a real environment-level constraint instead of a fake demo success
- the repository is now a good future candidate for measuring first-value improvements once more repeated tasks are run

## What Caused Friction

Two things were clearly friction points:

1. non-ASCII repository path triggered Codex WebSocket header encoding failures before fallback
2. no durable ExperienceEngine scope-local records were created from this single pass, so the repo remains in an early cold-start state

This is exactly the kind of case that justifies continued work on:

- cold-start visibility
- first-value readiness
- real-host case-study tracking

## Decision

Current decision for this repository:

- keep using it as an external cold-start validation repo
- prefer repeated similar verification tasks before expecting durable Pack-worthy experience
- treat the non-ASCII path issue as a real host constraint when evaluating Codex behavior
- avoid overstating “successful host execution” as “successful experience learning”

## Next Suggested Pass

The next useful pass on this repository should:

1. repeat the same task family at least one or two more times
2. check whether durable `task_runs` and input records start appearing for this scope
3. compare the second and third runs against this cold-start baseline

## Related References

- [Real Repo Usage Template](./real-repo-usage-template.md)
- [Case Study Template](./case-study-template.md)
- [ExperienceEngine Self-Hosted Case Study](./experienceengine-self-hosted-case-study.md)
