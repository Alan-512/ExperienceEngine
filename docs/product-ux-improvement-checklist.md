# ExperienceEngine Product And UX Improvement Checklist

## Purpose

This document tracks the highest-impact product and UX improvements for the current ExperienceEngine repository.

Current follow-up design:

- [Adoption, Quality, Evidence, And Distribution Design](./adoption-quality-evidence-design-2026-07-10.md)
- [OpenClaw Matched-Block Campaign V4](./openclaw-matched-block-campaign-v4.md)
- [Phase 0.5B Diagnostics And Public Feedback Plan](./phase-0.5b-diagnostics-public-feedback-plan-2026-07-16.md)
- Current implementation status:
  - Phase 0.5A.0 distribution/runtime reality baseline: complete
  - S1-S6 runtime authority, configuration, queue, and production activation slices: complete
  - S7 implementation, local-pack validation, WSL real-host validation, and native Windows real-host validation: complete
  - S7 exact published npm/ClawHub acceptance: complete
  - S8 matched-block benchmark implementation and repeated evidence acceptance: complete; the five-block real campaign passed its sealed single-scenario publication gate
  - Phase 0.5B D1-D3 safe diagnostics, reviewed archive, and public feedback assets: source, clean local-pack, and exact published npm `0.5.2` acceptance complete
  - Phase 0.5C residual multi-scenario evidence: exact published npm `0.5.2` campaign completed and independently validated; directional decision remains `not_publishable`

The Phase 0.5A.1 S1-S8 implementation sequence is complete. Runtime publication, privacy-safe diagnostics, and the matched-block benchmark machinery are validated. The retained v3 one-block pilot remains correctly `not_publishable`; the later v4 campaign completed five sealed three-arm blocks and passed every predeclared single-scenario threshold. The Phase 0.5C v5 campaign then completed nine arms across inject, correct-skip, and harm-recovery and independently validated the complete causal recovery path. V4 remains limited to one scenario cluster, while v5 has only one repetition per scenario and deliberately includes harmful exposure. Together they are directional evidence rather than a general full-support or cross-scenario efficacy claim. `support_claim_allowed=false` and `production_learning_ready=false` remain required.

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

Status: completed

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

Implemented:

- setup and value are now modeled separately:
  - `Setup state`: `Installed`, `Initialized`, `Ready`
  - `Value state`: `Warming up`, `First value reached`
- `ee install`, `ee init`, `ee status`, and `ee doctor` now use the same onboarding language
- `README` and `user-guide` now present one shared product journey with host-specific entry steps
- targeted setup-state fixes now keep `doctor` aligned with the onboarding model

### 5. Productize The Time-To-First-Value Period

Status: completed for the intended lightweight phase

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

Implemented:

- `ee status` and `ee doctor` now show first-value readiness in product language
- `First value reached` is now tied to visible output from real task runs, not just formal nodes
- warm-up guidance now gives a next step without pretending static onboarding text is value

### 6. Keep Routine Interaction Inside The Host Agent

Status: completed for the intended `Codex + Claude Code` scope

Problem:

- Codex and Claude Code should feel host-native in normal use, but some user guidance still leans too quickly toward CLI fallback

Scope note:

- this P0 item is intentionally scoped to `Codex` and `Claude Code`
- `OpenClaw` should keep the same product language where possible, but its routine-interaction UX should be planned as a separate later alignment pass
- do not silently widen this item into a three-host implementation without an explicit follow-up decision

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

Implemented:

- `Codex` and `Claude Code` routine follow-ups now consistently prefer the host session first
- CLI help and user docs now frame `ee` as fallback/operator path for routine review and feedback
- `OpenClaw` keeps the same product language, but its more visible CLI/operator fallback is now documented explicitly instead of being implied

## P1: Important Usability Improvements

### 7. Redesign The CLI Help Information Architecture

Status: completed for the current lightweight phase

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

Implemented:

- top-level help is now grouped by user goals:
  - get started
  - see what ExperienceEngine is doing
  - fix a problem
  - advanced operator commands
- help examples now use host-neutral placeholders instead of implying a Codex-only default

### 8. Tighten `inspect --last` Default Vs Verbose Layering

Status: completed

Problem:

- `inspect --last` is much better than before, but it still mixes everyday explanation and deeper product diagnostics in the same surface

Improvement:

Create a two-level model:

- default: short explanation of what happened and why
- deep mode: full scorecard and retrieval evidence

Suggested implementation:

- keep current default concise
- add an explicit deep or verbose mode instead of pushing more fields into default output

Implemented:

- default `ee inspect --last` now stays on explanation and trust
- `--verbose` carries the deeper scorecard and retrieval diagnostics
- `inspect node` and `inspect repo` remained stable while the last-turn surface was simplified

### 9. Strengthen The Cross-Host Mental Model

Status: completed for the intended docs-and-language pass

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

Implemented:

- `README`, `user-guide`, and `experience-model` now describe one shared product journey with host-specific entry steps
- common routine actions now use the same vocabulary across the main docs
- host-specific differences stay in the places where they actually change user behavior

### 10. Reduce Visible Terminology Density

Status: completed for default high-frequency surfaces

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

Implemented:

- default `status`, `doctor`, and `inspect --last` now lead with product-language explanations
- verbose inspection still preserves raw system route terms where operator precision matters
- retrieval-health summaries now keep human-readable labels without dropping the underlying system meaning entirely

### 11. Align OpenClaw Routine Interaction In A Dedicated Follow-Up Pass

Status: completed for the intended first full pass

Problem:

- `OpenClaw` already had mature runtime integration, but it still lacked a real in-host routine loop for the most common ExperienceEngine follow-up actions

Improvement:

Implement the first full `OpenClaw` routine-interaction follow-up as its own scoped pass.

Implemented:

- the OpenClaw plugin now handles three routine action families in-session:
  - what ExperienceEngine just injected
  - why the last hint matched
  - helped / harmed feedback for the last intervention
- these host-side control turns bypass normal ExperienceEngine finalization so they do not pollute task history or reusable learning
- CLI/operator fallback remains explicit for deeper inspection, repair, and advanced management

Acceptance criteria:

- OpenClaw now has a real routine-interaction implementation rather than a placeholder follow-up slot
- routine review and feedback no longer require default CLI fallback in OpenClaw

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

1. keep the completed onboarding / first-value / routine-interaction work stable
2. protect the completed `OpenClaw` routine-interaction alignment with regression coverage rather than reopening it as a later implementation pass
3. only pull deferred heavier surfaces forward if the lighter product path stops being sufficient

## Acceptance Bar For This Improvement Track

This UX improvement track should be considered successful when:

- a new user can complete setup and validation without ambiguity
- a user who has not yet seen reusable experience still understands what the product is doing
- common review and feedback tasks can be completed inside the host session when the host supports it
- default command outputs are readable without deep system knowledge
- the product feels coherent across all supported hosts

## Short Version

The biggest completed win in this phase was reducing friction in:

- onboarding
- first value
- routine host-native use

The remaining near-term UX work should stay narrow:

- protect the current lightweight path from regressing
- protect the completed `OpenClaw` routine-interaction follow-up with targeted regression checks
- avoid pulling heavier new surfaces forward before they are needed
