# ExperienceEngine Case Study Template

Use this template when you want to turn a real-repo pass into a stable, reviewable case study.

The purpose is not marketing copy. The purpose is to preserve enough structured evidence to answer:

- what repository and host were used
- what task family was repeated
- what ExperienceEngine actually did
- whether the intervention created net value
- what should be kept, changed, or retired

## When To Create One

Create a case study when at least one of these is true:

- the repository has produced repeated interventions in the same task family
- a Pack has been published from real usage
- compiled host-facing assets have been reviewed or deployed
- benchmark and evidence artifacts show a meaningful trend

Do not create a case study for one-off wiring checks or toy-repo smoke tests.

## Required Inputs

Before writing a case study, gather:

- repository name or anonymized label
- host used:
  - `OpenClaw`
  - `Claude Code`
  - `Codex`
- primary task family
- evaluation mode:
  - `live`
  - `shadow`
  - `holdout`
- latest benchmark report
- latest evaluation bundle
- latest evidence package
- any published Pack ids used in the pass
- any deployed host artifacts used in the pass

## Recommended Structure

Use the following sections.

### 1. Context

Capture:

- repository or anonymized system name
- host used
- date range of the pass
- primary problem area
- why ExperienceEngine was relevant

Example prompts:

- What kind of repeated work was happening?
- Why was this repo a good candidate for ExperienceEngine?

### 2. Initial State

Describe the starting situation before the current pass:

- repeated failures, repeated debugging, or repeated repair patterns
- whether prior experience already existed
- whether the repo already had Packs or compiled artifacts

Keep this concrete. Prefer task-family facts over general impressions.

### 3. ExperienceEngine Usage

Describe what was actually used:

- `inspect --last`
- `helped` / `harmed`
- Pack workflow used or not used
- compile targets used
- deploy targets used

If Packs were involved, record:

- pack id
- version
- whether the pack was newly published or reused

### 4. Evidence Summary

Pull the key numbers from artifacts:

- `deliveryRate`
- `suppressionRate`
- `helpfulRate`
- `harmfulRate`
- `netHelpfulRate`
- `verdict`
- `suggestedMode`

Also record:

- active packs
- matched packs
- deployed target status if relevant

### 5. What Actually Helped

Summarize the most useful interventions:

- which task family benefited
- which node or Pack patterns helped
- whether compiled host-facing files improved reuse

Prefer 2 to 5 concrete observations over a long generic summary.

### 6. What Caused Friction

Record:

- noisy interventions
- drifted deployed artifacts
- weak or confusing guidance
- cases where explicit feedback was necessary

If something should cool or retire, say so directly.

### 7. Decision

End the case study with a clear next-step decision:

- keep `live`
- move to `shadow`
- move to `holdout`
- publish / extend Pack
- redeploy compiled artifact
- cool / retire specific experience

## Minimal Markdown Skeleton

```md
# Case Study: <repo-or-anonymized-name>

## Context
- Host:
- Date range:
- Primary task family:
- Why ExperienceEngine was used:

## Initial State
- Repeated issue pattern:
- Existing nodes or packs:
- Existing compiled/deployed artifacts:

## ExperienceEngine Usage
- Commands / surfaces used:
- Packs involved:
- Compiled targets involved:
- Deployments involved:

## Evidence Summary
- deliveryRate:
- suppressionRate:
- helpfulRate:
- harmfulRate:
- netHelpfulRate:
- verdict:
- suggestedMode:

## What Helped
- ...

## What Caused Friction
- ...

## Decision
- ...
```

## How To Store It

Recommended options:

- keep the generated `case-study.md` from evaluation artifacts
- or write a curated case study under `docs/development/`
- link back to the matching benchmark report, evaluation bundle, and evidence package

If the repository name is sensitive, anonymize it consistently and keep the artifact paths separately.

## Quality Bar

A good case study should be:

- based on real repository work
- tied to real artifacts
- specific about what helped and what harmed
- short enough to re-read quickly
- actionable enough to inform the next Pack / deploy / mode decision
