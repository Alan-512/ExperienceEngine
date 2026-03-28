# OpenClaw Structured Silence Reason Spec

## Status

Drafted for the next implementation pass.

## Purpose

This spec defines a focused follow-up to the `OpenClaw` phase-2 routine-interaction work.

The current `recent silence` answer is product-usable, but its reason selection still depends on string matching against timeline summary text. That is acceptable as a temporary bridge, but it is too fragile to be the long-term basis for a user-facing host-native answer.

This spec replaces that string-matching path with a structured silence-reason model.

## Product Goal

When an `OpenClaw` user asks:

- "Why didn't ExperienceEngine inject anything just now?"
- "Why was there no hint on the last turn?"
- "Why did EE stay quiet?"

the in-session answer should be grounded on an explicit reason code or structured reason category, not inferred from human-readable timeline phrasing.

The answer should remain:

- short
- product-language first
- scoped to the current workspace
- non-operator by default

## Non-Goals

- redesigning the retrieval or gate system itself
- changing how hints are injected for other hosts
- moving full retrieval diagnostics into the `OpenClaw` host session
- exposing raw scorecards, top candidates, or gate internals by default
- changing `helped / harmed`, readiness, or warm-up behavior

## Problem Statement

Today, `OpenClaw` recent-silence answers are derived from user-facing timeline summaries.

This creates three product risks:

1. **wording fragility**
   - if timeline text changes, silence explanations can silently degrade

2. **semantic drift**
   - a summary sentence is written for humans, not for downstream machine selection

3. **test brittleness**
   - tests end up locking phrasing rather than structured behavior

The product should not depend on summary prose to decide which high-level explanation to show the user.

## Product Principle

`recent silence` is a user-facing explanation layer over a machine-readable decision outcome.

That means:

- routing and retrieval can stay complex internally
- the host answer should map that complexity into a small, stable set of user-visible categories
- the mapping should come from structured state, not from parsed English sentences

## Desired User-Facing Categories

The product does not need a large taxonomy.

This pass should normalize silence into a small set of stable reason families:

1. `warming_up`
   - ExperienceEngine is still collecting enough real-task evidence in this repo

2. `no_strong_match`
   - ExperienceEngine did not find a strong enough reusable match for the turn

3. `withheld_low_confidence`
   - ExperienceEngine found some signal but deliberately did not deliver guidance because confidence stayed below the delivery bar

4. `non_applicable_turn`
   - the latest turn was not the kind of task where ExperienceEngine would normally inject reusable guidance

5. `unknown`
   - fallback only when a more specific structured reason is unavailable

These categories are for internal selection and product-language rendering. They do not need to be exposed verbatim to the user.

## Required Behavior

### Scope-Aware

The silence reason must be derived from the latest interaction in the current workspace scope.

It must not fall back to a different scope when scoped state exists.

### Structured Before Rendered

The system must determine a structured silence-reason category first.

Only after that should the host-facing explanation text be composed.

### Product-Language First

The host answer should still be brief and human-readable, for example:

- "ExperienceEngine is still warming up in this repo..."
- "ExperienceEngine did not find a strong enough reusable match..."
- "ExperienceEngine stayed cautious because it did not have enough confidence to deliver guidance..."

The user should not see raw gate jargon unless they explicitly ask for deeper diagnostics.

### Stable Fallback

If the system truly cannot classify the reason with confidence, it may use `unknown`, but this should be treated as a fallback path, not the normal path.

## Implementation Shape

### 1. Add A Structured Silence-Reason Derivation Step

Introduce a narrow helper that derives a silence-reason category from structured interaction state.

Prefer structured inputs such as:

- latest intervention mode
- delivery flag
- first-value readiness
- scorecard fields
- route / decision metadata already persisted in the interaction layer

Do not derive the category by searching user-facing timeline summary prose.

### 2. Keep The Renderer Thin

Once a category is selected, the OpenClaw routine formatter should only map category -> short product-language explanation.

It should not re-implement retrieval logic or route analysis in the formatter itself.

### 3. Preserve Existing Boundaries

This pass should not change:

- normal task finalization bypass for control turns
- current readiness and first-value routine answers
- CLI as the deep diagnostic and repair path

## Testing Requirements

Tests should verify structured behavior, not just copied phrasing.

At minimum, cover:

1. a warming-up repo where silence is explained as evidence still accumulating
2. a repo with first value already reached but no strong match on the latest turn
3. a turn where guidance was withheld because confidence stayed below delivery threshold
4. fallback behavior when no structured reason can be derived

The assertions should primarily lock:

- the selected behavior category
- the high-level explanation intent
- no learning pollution for the control turn

They should not depend on brittle internal summary phrasing.

## Acceptance Criteria

1. `OpenClaw` recent-silence answers no longer depend on string matching against timeline summary text.
2. The plugin derives a structured silence-reason category before rendering the user-facing answer.
3. The host answer remains short and product-language first.
4. The latest scoped interaction still determines the answer.
5. Control turns still bypass normal task history and learning promotion.

## Out Of Scope Follow-Ups

If later needed, separate future work can cover:

- exposing deeper silence diagnostics through a verbose host path
- sharing the same structured silence-reason model with `Codex` or `Claude Code`
- broad retrieval-decision explainability refactors across all hosts

Those should not be folded into this pass.
