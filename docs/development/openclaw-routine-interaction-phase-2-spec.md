# OpenClaw Routine Interaction Phase 2 Spec

## Status

Drafted for the next implementation pass.

## Purpose

This spec defines the next `OpenClaw` host-native routine-interaction pass after the first three review and feedback actions were completed.

Phase 1 already covers:

1. what ExperienceEngine just injected
2. why the last hint matched
3. marking the last intervention as helped or harmed

Phase 2 should not repeat those actions or widen into operator tooling. It should close the next most common in-session questions: current readiness, warm-up progress, and why ExperienceEngine recently stayed quiet.

## Product Goal

Keep the next layer of high-frequency ExperienceEngine follow-up questions inside the normal `OpenClaw` host session:

1. whether ExperienceEngine is ready in the current repo
2. whether the repo is still warming up or has reached first value
3. why the most recent turn did not inject a hint

The goal is to let a normal user stay inside the host session for everyday orientation questions, not to expose full diagnostics or management inside the host.

## Non-Goals

- moving `ee doctor` or `ee status` wholesale into the host session
- exposing repair, install, upgrade, backup, rollback, cool, retire, or archive actions in-session
- duplicating full CLI inspect output inside `OpenClaw`
- changing ExperienceEngine learning, retrieval, scoring, or promotion behavior
- extending this pass to `Codex` or `Claude Code`

## Product Principle

For `OpenClaw`, host-native routine interaction should expand in layers:

1. the user asks the normal host agent directly
2. the plugin resolves the question from grounded ExperienceEngine state
3. the model answers directly from that grounded state
4. deeper diagnostics and operator workflows stay in CLI unless the host question clearly requires them

This pass should preserve the same separation:

- in-session answers for common orientation questions
- CLI for repair, verbose diagnostics, and advanced operations

## Scope

This pass should add three routine action families.

### 1. Readiness In The Current Repo

Support prompts such as:

- "Is ExperienceEngine ready here?"
- "Is EE set up in this repo?"
- "Can ExperienceEngine work in this workspace now?"

The grounded answer should summarize:

- current `Setup state`
- current host wiring status in product language
- the single next step if the repo is not yet `Ready`

This is not a full `doctor` replacement. The host answer should stay short and only mention CLI if the user asks for repair or deeper validation.

### 2. Warm-Up And First-Value Progress

Support prompts such as:

- "Is ExperienceEngine still warming up?"
- "Has EE started producing value here yet?"
- "Why am I not seeing reusable hints yet?"

The grounded answer should summarize:

- current `Value state`
- whether the repo is still warming up or has reached first value
- the most useful next task pattern if the repo is still warming up

The answer must stay tied to real task evidence. It must not claim first value from static onboarding text alone.

### 3. Recent Silence / Recent Skip Explanation

Support prompts such as:

- "Why didn't ExperienceEngine inject anything just now?"
- "Why was there no hint on the last turn?"
- "Why did EE stay quiet?"

The grounded answer should summarize the latest interaction in the current scope and explain, in product language:

- whether the latest turn was a `skip`
- the main reason no hint was delivered
- whether the system is quiet because it is still warming up, lacked a strong match, or deliberately stayed conservative

This should stay short. Full retrieval diagnostics remain in CLI inspect surfaces.

## Required Behavior

### Grounded State Only

The plugin must answer these actions from real `ExperienceInteractionService` state.

It must not ask the model to infer:

- setup readiness
- warm-up progress
- first-value state
- why the latest turn stayed quiet

### Scope-Aware Answers

All three actions must resolve against the current workspace scope first.

They must not default to a global last record when scoped state exists.

### Product-Language First

Answers should lead with product language:

- `Setup state`
- `Value state`
- `next step`
- short reason for silence

Raw internal route or gate terms may be included only when needed for grounding, not as the primary user-facing answer.

### No Learning Pollution

These control turns are still host-side routine interactions.

They must not:

- create normal task runs
- create reusable experience candidates
- pass through normal task finalization

## Implementation Shape

### 1. Extend OpenClaw Routine Intent Detection

Add a narrow second set of intents for:

- repo readiness
- warm-up / first-value progress
- recent silence explanation

Detection must stay conservative and require an explicit ExperienceEngine reference.

### 2. Add Grounded Formatters For State And Silence

Add short host-facing context formatters that reuse existing interaction surfaces:

- readiness summary
- first-value progress summary
- latest-skip explanation

Prefer reusing:

- `inspectRepoSummary`
- `inspectFirstValueReadiness`
- `inspectLast`
- existing `status` / `doctor` state helpers where possible

Do not duplicate the underlying decision logic inside the plugin.

### 3. Keep CLI As The Repair And Deep-Diagnostic Path

If the grounded state shows the repo is not ready, or if the user wants repair detail, the injected context may mention:

- `ee status` for day-to-day progress
- `ee doctor <host>` for explicit validation and repair

But the default host answer should still answer the immediate question first.

## Acceptance Criteria

1. In `OpenClaw`, the user can ask whether ExperienceEngine is ready in the current repo and get an in-session grounded answer.
2. In `OpenClaw`, the user can ask whether the repo is still warming up or has reached first value and get an in-session grounded answer.
3. In `OpenClaw`, the user can ask why the latest turn produced no hint and get an in-session grounded answer from the latest scoped interaction.
4. These orientation turns do not create new normal task runs or reusable experience candidates.
5. CLI remains the fallback for repair and deep diagnostics, but it is no longer the default answer for these routine questions.
