# Onboarding And First-Value Spec

## Status

Draft for implementation planning.

## Purpose

This spec defines the next lightweight product pass for:

- first successful onboarding
- warm-up explanation
- first-value guidance

It does **not** redesign host installation internals. It defines a unified product journey that can be expressed consistently across `OpenClaw`, `Claude Code`, and `Codex`, while still allowing host-specific installation steps.

## Product Principle

Use one product journey with host-specific entry steps.

That means:

- the user should learn one ExperienceEngine mental model
- each host may still use different install and reload mechanics
- the product should unify status language, success criteria, and next-step guidance

## Goals

1. Make a new user understand exactly where they are after installation.
2. Separate `installed`, `initialized`, and `ready` as product states.
3. Treat setup readiness and value realization as separate dimensions.
4. Make warm-up feel like visible progress, not silent waiting.
5. Define first value early enough that the product feels alive before mature reusable hints appear, while still tying it to visible output from real work.
6. Keep the product language consistent across all supported hosts.

## Non-Goals

- making all host install steps identical
- replacing host-native install flows with a single universal installer
- changing the current host-native install priority
- building a new standalone UI
- changing the learning core, retrieval core, or storage model

## Unified Product Model

The product should not treat onboarding and product value as a single linear five-stage state machine.

It should use two layers:

1. `Setup state`
   - `Installed`
     - ExperienceEngine has been connected to the selected host.
     - This does not yet guarantee shared state initialization.
   - `Initialized`
     - Shared ExperienceEngine product state is configured.
     - Shared settings, provider configuration, and secrets are ready for use.
   - `Ready`
     - The host wiring is active for the current repo or session.
     - The user can start a real task and expect ExperienceEngine to observe it correctly.
2. `Value state`
   - `Warming up`
     - ExperienceEngine is recording and evaluating real work.
     - It may not yet have enough evidence to produce mature reusable hints.
   - `First value reached`
     - The user can already see meaningful product output derived from a real task.

These two layers are allowed to coexist.

Examples:

- a user can be `Ready` and still be `Warming up`
- a user can be `Ready` and have already reached first value
- `First value reached` does not imply mature validated reusable guidance already exists

## Unified Success Criteria

Regardless of host, the product should help the user answer the same questions:

- Is ExperienceEngine installed into this host?
- Is shared ExperienceEngine state initialized?
- Is this repo or session ready for a real task?
- Is the system warming up, or has it already started producing value?
- What is the next action that will move me forward?

## Host-Specific Boundaries

The following must remain host-specific:

- installation actions
- restart or new-session requirements
- host-native interaction surfaces
- fallback points to CLI

Examples:

- `OpenClaw`
  - plugin installation and gateway restart are host-specific
- `Codex`
  - MCP wiring and new-session pickup are host-specific
- `Claude Code`
  - marketplace/plugin flow and new-session pickup are host-specific

These differences are valid. The product should not hide them. It should present them underneath the same journey model.

## Product Language Requirements

The following terms should be used consistently:

Setup state:
- `Installed`
- `Initialized`
- `Ready`

Value state:
- `Warming up`
- `First value reached`

Avoid mixing these with ad hoc host-specific state labels when presenting the user journey.

## First-Run Product Behavior

After a host installation succeeds, the product should not stop at a raw success message.

It should immediately orient the user with:

- current setup state
- current value state, if known
- missing setup step, if any
- next required action

The intended flow is:

1. host installation completes
2. user is told whether initialization is still missing
3. user is told whether a restart or new session is required
4. user is told when the environment becomes `Ready`
5. user is told what first real task will best unlock value

## Warm-Up Behavior

`Warming up` should be presented as active product progress.

It should communicate:

- ExperienceEngine is already recording real work
- reusable experience is still being established
- the current repo is not broken or idle
- the next best task shape to unlock first value

Warm-up messaging should avoid sounding like a passive disclaimer.

## First-Value Definition

For this product phase, `first value` should be defined early enough that users can feel progress before mature intervention becomes common, but it must remain tied to visible output from real work.

Any of the following may count as `First value reached`:

- the first real task record is visible
- the first learning decision is visible
- the first intervention is visible
- another similarly concrete output tied to a completed real task run

The following do **not** count by themselves:

- a generic warm-up explanation
- a static onboarding message
- a recommendation that is not tied to a real observed task run

The product should not require a mature validated strategy node before telling the user they have reached first value, but it must require a visible artifact from real task execution.

## Surfaces In Scope

This spec should primarily influence:

- `README.md`
- `docs/user-guide.md`
- post-install orientation output
- `ee status`
- `ee doctor`
- lightweight host follow-up guidance after install or repair

Constraint:

- this spec only standardizes post-install product language and follow-up guidance
- it does not move public onboarding back to `ee install` as the default first-install entrypoint

## Recommended Implementation Shape

1. Define a shared two-layer state vocabulary for setup readiness and value realization.
2. Update user-facing docs so the first successful path is shown before advanced detail.
3. Make install and doctor output reflect the unified model:
   - what setup state the user is in
   - what value state the user is in, if knowable
   - what is missing
   - what to do next
4. Add a lightweight first-value explanation path:
   - if still warming up
   - why that is normal
   - what next task is most useful

## Acceptance Criteria

1. A new user can tell the difference between `Installed`, `Initialized`, and `Ready` without reading multiple documents.
2. A new user can understand that `Ready` and `Warming up` can be true at the same time.
3. A new user can reach a verified ready state in one short path per host.
4. Warm-up messaging tells the user what is happening and what task to do next.
5. `First value reached` is only shown after visible output from a real task run.
6. The product language is consistent across `OpenClaw`, `Claude Code`, and `Codex` without changing host-native install priority.

## Open Decisions For The Implementation Plan

- Which command or surface should become the canonical "where am I in the journey?" view?
- Whether `first value` should be shown in `status`, `doctor`, or both
  - default leaning:
    - `status` should carry the day-to-day journey and value-progress view
    - `doctor` should stay focused on explicit validation, repair, and troubleshooting
- How much host-native follow-up text should be emitted immediately after install versus deferred to docs
