# ExperienceEngine Product And UX Improvement Checklist

## Purpose

This document tracks the highest-impact product and UX improvements for the current ExperienceEngine repository.

It is intentionally execution-oriented:

- already completed work is called out explicitly
- near-term work is narrowed to the next realistic product wins
- heavier ideas stay deferred until the lighter product path proves itself

The goal is not to re-open core architecture debates.

The goal is to improve:

- first-time onboarding success
- time-to-first-value
- everyday usability inside host agents
- troubleshooting clarity
- product trust and perceived polish

## Current Product Assessment

ExperienceEngine already has a meaningful product core:

- the learning loop exists
- install, repair, and health-check surfaces exist
- host integrations exist for `OpenClaw`, `Claude Code`, and `Codex`
- inspect and feedback loops exist
- backup, rollback, and repair workflows exist

The main product gap is no longer missing capability.

The main product gap is reducing friction:

- first-run setup still feels fragmented
- first value still takes time and needs better guidance
- some default CLI/help flows are still more system-oriented than task-oriented
- host-native interaction should be the primary path wherever the host can support it cleanly

## Priority Model

- `Completed`: already implemented well enough for the current product phase
- `P0`: highest-impact next work for adoption and first successful use
- `P1`: important usability improvements after `P0`
- `Deferred`: reasonable later ideas that should not be pulled forward now

## Completed

### 1. Explanation Layer Across Core Product Surfaces

Status: completed

Implemented:

- `ee inspect --last` now explains:
  - whether the route was normal or conservative
  - why ExperienceEngine acted
  - a trust summary
- `ee inspect node:<id>` now shows:
  - current assessment
  - `quality band`
  - quality drivers
  - a compact applicability profile
- `ee inspect repo` and repo summary resources now expose:
  - latest intervention summary
  - latest decision explanation
- Codex MCP summaries now expose:
  - action reason
  - trust summary
  - retrieval notes
- `ee status` and `ee doctor` now use more product-language retrieval health guidance

Why this matters:

- the product no longer feels like a pure diagnostics feed
- users can judge trust and actionability faster
- skip / conservative / inject decisions are more legible

### 2. Lightweight Quality Expression Layer

Status: completed for the intended lightweight phase

Implemented:

- `quality band` with lightweight categories:
  - `strong`
  - `building`
  - `risky`
- visible quality drivers
- compact applicability profile:
  - best fit
  - scope validity
  - confidence
  - risk
  - avoid-when guidance

Why this matters:

- users can judge an experience node without reading raw runtime fields
- the product now answers "should I trust this?" much faster

### 3. Learning Eligibility Tightening

Status: completed for the intended near-term product scope

Implemented:

- task records and reusable experience are treated as separate layers
- wording-only and presentation-only runs are recorded but not promoted
- learning decisions are visible through:
  - `learning_status`
  - `learning_reason`
- inspect surfaces explain whether a task was:
  - learned
  - rejected
  - kept as history only

Why this matters:

- this reduces user-facing noise in what later becomes reusable experience
- it improves trust in future hints by keeping weak local edits out of the reusable layer

## P0: Next Highest-Impact Improvements

### 4. Unify The First Successful Onboarding Path

Problem:

- the current setup path still spans host install, shared init, validation, session restart, and first real task
- a new user can still lose confidence before first successful use

Improvement:

Compress the first-run journey into one visible path:

1. install into chosen host
2. initialize shared ExperienceEngine state
3. validate wiring
4. start one real task
5. review first recorded result

Suggested implementation:

- create a single onboarding guide in `docs`
- give each host a short "fastest successful path" before any advanced detail
- make the difference between `installed`, `initialized`, and `ready` explicit

Acceptance criteria:

- a new user can reach a verified setup in about 10 minutes without reading multiple scattered docs
- the user always knows the next required step

### 5. Productize The Time-To-First-Value Period

Problem:

- ExperienceEngine behaves correctly during warm-up, but the product still explains warm-up more than it guides it

Improvement:

Expose first-value progress in product language:

- how much relevant evidence exists
- whether the repo is still warming up
- what kind of next tasks are most likely to unlock first useful experience

Suggested implementation:

- improve first-value readiness output
- add concrete warm-up next steps
- keep the language focused on user progress, not internal counters first

Acceptance criteria:

- a user without reusable hints still understands that the system is functioning
- the product gives a concrete next step during warm-up

### 6. Keep Routine Interaction Inside The Host Agent

Problem:

- Codex and Claude Code should feel host-native in normal use, but some user guidance still leans too quickly toward CLI fallback

Improvement:

Prefer host-native follow-ups for normal actions:

- ask what ExperienceEngine just injected
- ask why a hint matched
- tell the agent a hint helped or harmed

CLI should remain:

- fallback
- automation surface
- repair surface
- explicit inspection surface

Acceptance criteria:

- common review and feedback flows can stay in the host session
- CLI feels like fallback, not default routine interaction

## P1: Important Usability Improvements

### 7. Redesign The CLI Help Information Architecture

Problem:

- top-level help still exposes too much breadth too early

Improvement:

Organize help around user goals:

- get started
- see what ExperienceEngine is doing
- fix a problem
- advanced operations

Suggested implementation:

- simplify top-level help
- move lower-level commands into advanced help
- add example commands by goal

### 8. Tighten `inspect --last` Default Vs Verbose Layering

Problem:

- `inspect --last` is much better than before, but it still mixes everyday explanation and deeper product diagnostics in the same surface

Improvement:

Create a two-level model:

- default: short explanation of what happened and why
- deep mode: full scorecard and retrieval evidence

Suggested implementation:

- keep current default concise
- add an explicit deep or verbose mode instead of pushing more fields into default output

### 9. Strengthen The Cross-Host Mental Model

Problem:

- the three supported hosts are validly different, but that difference still creates product fragmentation

Improvement:

Present one product mental model:

- install differs by host
- normal use should feel similar
- feedback, inspection, pause, and recovery should map to the same user concepts

Suggested implementation:

- align per-host doc section order
- define one shared vocabulary for common user actions
- reduce host-specific detail in the main path unless it changes actual user behavior

### 10. Reduce Visible Terminology Density

Problem:

- some internal concepts are still too visible in ordinary user-facing output

Examples:

- `conservative injection`
- `cooling`
- `priority candidate`

Improvement:

Prefer product-language explanation first, internal term second.

Suggested implementation:

- default output: user-facing explanation
- verbose or expert mode: raw system terms and field names

## Deferred

These ideas are reasonable but should not be pulled into the current phase:

- a rich standalone quality card UI
- provenance timeline as a first-class user-facing history surface
- a new summary application or large dashboard surface
- broader internal publication or packaging layers
- strategy/case dual asset projection
- reputation or monetization systems

Reason for deferral:

- the lightweight product layer now works
- the next wins are onboarding and first-value flow
- heavier surfaces would increase product weight before the simpler path is fully proven

## Recommended Delivery Order

1. unify onboarding into one fastest successful path
2. productize time-to-first-value guidance
3. prefer host-native follow-up guidance over CLI fallback in routine paths
4. redesign CLI help around user goals
5. split `inspect --last` into default and deep inspection layers
6. align cross-host docs and vocabulary

## Acceptance Bar For This Improvement Track

This UX improvement track should be considered successful when:

- a new user can complete setup and validation without ambiguity
- a user who has not yet seen reusable experience still understands what the product is doing
- common review and feedback tasks can be completed inside the host session when the host supports it
- default command outputs are readable without deep system knowledge
- the product feels coherent across all supported hosts

## Short Version

The biggest remaining opportunity is not adding more capability.

The next product win is reducing friction in:

- onboarding
- first value
- routine host-native use

The explanation and lightweight quality-expression layer is now largely done.

The next UX phase should make the product easier to start, easier to understand during warm-up, and easier to use without leaving the host session.
