# OpenClaw Routine Interaction Phase 3 Spec

## Status

Drafted for the next implementation pass.

## Purpose

This spec defines the final host-native routine-interaction layer for `OpenClaw`.

Phase 1 already covers:

1. what ExperienceEngine just injected
2. why the last hint matched
3. marking the last intervention as helped or harmed

Phase 2 already covers:

1. whether ExperienceEngine is ready in the current repo
2. whether the repo is still warming up or has reached first value
3. why the most recent turn did not inject a hint

Phase 3 should complete the **daily host-native interaction loop** without expanding into operator workflows.

## Completion Boundary

After this phase, the `OpenClaw` daily interaction track should be considered complete when:

- the user can review the latest intervention
- understand current readiness and first-value state
- understand recent silence
- give basic helped / harmed feedback
- ask for a compact repo-level ExperienceEngine summary

CLI should remain the path for:

- explicit diagnostics
- repair and install actions
- advanced inspection
- node management and operator workflows

## Product Goal

Keep the final high-frequency "what is ExperienceEngine doing in this repo right now?" question inside the normal `OpenClaw` host session.

This pass should add one new routine action family:

1. a compact repo-level ExperienceEngine summary for the current workspace

The goal is to let the user get a short, grounded state snapshot in-session, without opening CLI for ordinary day-to-day orientation.

## Non-Goals

- moving `ee inspect repo` wholesale into the host session
- exposing full learning counters, scorecards, or raw retrieval diagnostics in-session
- exposing install, repair, upgrade, backup, rollback, cool, retire, archive, or operator actions in-session
- redesigning learning, retrieval, promotion, or scoring
- extending this pass to `Codex` or `Claude Code`

## Product Principle

Phase 3 should complete the **routine understanding loop**, not the operator loop.

That means:

- answer the user’s immediate repo-level question in-session
- use grounded state from existing interaction surfaces
- stay compact and product-language first
- point to CLI only when the user clearly needs deeper detail or repair

## Scope

This pass should add one routine action family.

### Repo-Level ExperienceEngine Summary

Support prompts such as:

- "What is ExperienceEngine doing in this repo right now?"
- "Give me a quick ExperienceEngine summary for this workspace."
- "Summarize ExperienceEngine state here."
- "What's the current ExperienceEngine status in this repo?"

The grounded answer should summarize, in compact product language:

- current `Setup state`
- current `Value state`
- latest intervention summary when one exists
- whether the repo is currently producing reusable guidance, still warming up, or staying mostly quiet
- the single best next step when useful

This should be a short orientation snapshot, not a dump of internal counters.

## Required Behavior

### Grounded State Only

The answer must be built from real ExperienceEngine state.

Prefer existing sources such as:

- `inspectRepoSummary`
- `inspectLast`
- `inspectFirstValueReadiness`
- setup-state helpers already used by `status` / `doctor`

Do not rely on the model to infer repo state from vague context.

### Scope-Aware

The summary must describe the current workspace scope first.

It must not drift to a different repo when scoped state exists.

### Compact Product-Language First

The default host answer should stay concise and readable:

- one short summary block
- no raw scorecards
- no deep retrieval fields
- no operator-heavy terms unless explicitly requested

### No Learning Pollution

This remains a routine control interaction.

It must not:

- create a normal task run
- create reusable candidates
- enter normal task finalization

## Implementation Shape

### 1. Extend OpenClaw Routine Intent Detection

Add a conservative intent for repo-summary questions.

It should trigger only when:

- the message explicitly references ExperienceEngine or EE
- the user is asking for a repo/workspace-level summary or current state snapshot

### 2. Add A Compact Repo-Summary Formatter

Create a short formatter that composes a host-facing snapshot from existing interaction state.

It should answer questions like:

- are we ready?
- are we warming up?
- what happened most recently?
- what is the next useful move?

without copying full CLI inspect output.

### 3. Keep CLI As The Deep Path

If the user wants deeper detail, the answer may point to:

- `ee status`
- `ee inspect --last`
- `ee inspect repo`
- `ee doctor <host>`

But only after first answering the summary question directly.

## Acceptance Criteria

1. In `OpenClaw`, the user can ask for a quick ExperienceEngine summary of the current repo and get an in-session grounded answer.
2. The summary stays scoped to the current workspace.
3. The answer stays compact and product-language first.
4. The turn does not create a normal task run or reusable experience candidate.
5. After this pass, the `OpenClaw` daily host-native interaction track can be considered complete, with CLI remaining the operator path.

## Out Of Scope Follow-Ups

If later needed, future work can still cover:

- richer repo summaries with verbose/detail levels
- host-native access to deeper inspect views
- broader operator workflows inside `OpenClaw`

Those should not be pulled into phase 3.
