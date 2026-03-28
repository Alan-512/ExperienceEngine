# Product Proposal: Experience Asset Quality Expression

## Status

- audience: internal
- horizon: near-term
- scope: Phase 1 only
- implementation: mostly completed in lightweight form

## Implementation Status

Phase 1 has now been implemented in the intended lightweight product form.

Completed:

- lightweight injection notice + fuller inspect detail
- product-language explanation for `inspect`, `status`, `doctor`, repo summary, and Codex MCP summaries
- lightweight `quality_band` expression (`strong`, `building`, `risky`)
- visible quality drivers
- compact applicability profile on node inspection surfaces

Intentionally not implemented in this phase:

- numeric quality scoring
- rich quality card UI
- provenance timeline
- new asset classes or publication layers

This means the proposal should now be treated as delivered for the narrow Phase 1 scope, with only deferred items left open.

## Why This Proposal Exists

ExperienceEngine already has the hard part of the product:

- it learns from real task evidence
- it promotes or cools interventions based on outcomes
- it tracks `helped`, `harmed`, `support`, and lifecycle state
- it can retire bad guidance instead of only accumulating memory

So the current product gap is no longer "can EE learn useful experience?"

The actual gap is:

- users cannot judge asset quality quickly enough
- reviewers cannot see applicability and risk clearly enough
- injected guidance is still stronger in runtime truth than in product legibility

This proposal focuses on fixing that gap.

## Product Decision

The next product milestone is not marketplace, publication, or asset-model expansion.

The next milestone is to make each experience asset easier to judge before we add broader packaging layers.

That means this proposal is intentionally narrow:

- make asset quality easier to inspect
- make applicability easier to understand
- make runtime injection easier to trust

It does not try to redesign the storage model or create new asset classes yet.

## Goals

This proposal has three goals:

1. Make the current quality of an asset obvious without reading raw runtime fields.
2. Make applicability, confidence, and risk explicit enough for human review.
3. Improve trust in EE interventions by showing why an asset is being used.

## Non-Goals

This proposal explicitly does not include:

- marketplace or sharing workflows
- strategy/case dual asset projection
- storage-model rewrites
- public publication surfaces
- reputation or monetization systems
- a standalone review application

## Current Product Gap

ExperienceEngine already governs asset quality internally, but the product surface is still too implicit.

Today, a reviewer often has to infer quality by reading a mix of:

- lifecycle state
- `helped` / `harmed` / `support`
- validation state
- CLI inspection output
- runtime-specific fields

That is workable for internal development, but not good enough as a product surface.

The near-term issue is not missing learning logic.

The near-term issue is weak quality expression.

## Phase 1: Quality Expression Layer

### Objective

Make an asset's usefulness, applicability, and risk legible in one compact inspection surface.

This phase should stay close to the current engine. It should package existing runtime truth more clearly, not invent a second product model.

### Deliverable 1: Quality Score With Visible Drivers

Add a first-class `quality_score` or `quality_band` for product inspection.

It should be derived from signals EE already has, such as:

- `helped` vs `harmed`
- `support_count`
- lifecycle state
- validation state
- recency
- evidence depth

The score must stay explainable.

The product should always show what is pushing the score up or down, instead of presenting a raw number as authority.

### Deliverable 2: Applicability Profile

Each asset should expose a compact applicability profile:

- best-fit task family
- scope of validity
- known exclusions
- confidence level
- risk level

This is the missing surface that answers:

- where should this asset be trusted?
- where should it be used carefully?
- where should it probably not fire?

### Deliverable 3: Lightweight Injection Notice + Inspect Detail

When EE injects an asset, the product should make the intervention easier to trust without turning the main agent conversation into a diagnostics panel.

The product should use two layers:

- an in-session lightweight notice
- a fuller inspect surface

The in-session notice should stay thin. It only needs to tell the user:

- that an asset was injected
- whether it is broadly validated or still risky
- where to inspect the full reasoning

The fuller explanation should live in inspect surfaces such as the existing intervention review flow. That detailed view should expose:

- why this asset matched
- what evidence level it currently has
- whether it is mature, risky, or still weakly validated

This is not a separate retrieval system change. It is a product-facing explanation layer on top of the current decision, with the detail kept out of the primary agent transcript unless the user explicitly inspects it.

## Deferred Work

The following ideas are reasonable, but should not be in this phase:

- provenance timeline as a first-class case-history surface
- rich quality card UI beyond the minimum inspection view
- `Strategy Asset` / `Validated Case Asset` product split
- broader internal publication or packaging flows

Those are only worth doing after the team proves that the simpler quality-expression surface is genuinely useful in day-to-day review.

## Success Criteria

This proposal is successful if an internal reviewer can inspect one asset and quickly answer:

- what this asset is for
- how strong the evidence is
- what risk it currently carries
- where it should apply
- why EE chose to inject it

If those questions can be answered without reading raw node fields, Phase 1 has done its job.

## Product Risks

- false precision: a score may feel more authoritative than it is
- over-surfacing: too much evidence detail can make review slower instead of clearer
- transcript noise: if inline intervention messaging becomes too verbose, it will distract from the main task
- premature expansion: once quality surfaces exist, it becomes tempting to add packaging layers too early

## Recommendation

Ship a narrow quality-expression phase first.

Do not expand into asset projection, publication, or platform mechanics yet.

ExperienceEngine's next product win should be simple:

- better asset judgment
- clearer applicability
- more trustworthy interventions

Once that is working in real review loops, we can decide whether richer asset packaging is actually necessary.
