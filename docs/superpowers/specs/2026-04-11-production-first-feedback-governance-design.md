# Production-First Feedback Governance Design

Date: 2026-04-11

## Summary

ExperienceEngine's current feedback and lifecycle loop is optimized to avoid over-retiring experience, not to minimize production harm. That tradeoff is no longer the right default.

Today, successful tasks are automatically counted as `helped`, harmful guidance can remain injectable for too long if it has historical wins, and lifecycle state doubles as delivery permission. This makes EE too tolerant of repeated harmful exposure in production.

This design changes the governing rule:

1. production safety takes priority over recall
2. delivery permission is separated from lifecycle maturity
3. harmful experience is removed from live exposure quickly
4. successful outcomes do not automatically prove injected experience was helpful
5. LLMs participate primarily in posttask adjudication, not as a universal hot-path gate

The design keeps EE's cold-start value by preserving a bounded first-use path for high-quality new experience through `priority_candidate`, but ordinary `candidate` nodes no longer inject into live tasks.

## Problem

The current system has three product-level issues:

1. `success => helped` is too optimistic.
2. state transition is based on lifetime counts instead of recent risk.
3. lifecycle state is also used as delivery permission.

That creates several concrete failures:

- a hint can derail the task, the user can recover manually, and the node is still marked `helped`
- a historically good node can harm several recent tasks before cooling or retirement happens
- `cooling` nodes still remain in the live injection path
- all `candidate` nodes are still considered injectable, even though they are explicitly early-stage evidence

The current architecture therefore protects the experience library from false negatives better than it protects live tasks from repeated harmful hints.

## Product Goals

### Primary goals

- Remove harmful experience from live exposure faster.
- Preserve a narrow, controlled first-use path for high-value new experience.
- Make feedback attribution more accurate than `success => helped`.
- Keep writeback deterministic and runtime-owned even when LLM review is enabled.
- Preserve host-agnostic core behavior across Codex, Claude Code, and OpenClaw.

### Non-goals

- No full event-sourced redesign.
- No full LLM takeover of hot-path injection decisions.
- No removal of the existing lifecycle states.
- No attempt in phase 1 to optimize promotion speed for good experience beyond what is required for `priority_candidate` canary use.

## Design Principles

1. Stop harm before improving learning.
2. Delivery eligibility and lifecycle maturity are different concerns.
3. LLM outputs are bounded recommendations, not direct write commands.
4. The runtime remains the only writeback owner.
5. New experience may earn a canary launch, but only through explicit qualification.

## Final Architecture

### Lifecycle State

Lifecycle state continues to describe knowledge maturity:

- `candidate`
- `priority_candidate`
- `active`
- `cooling`
- `retired`

### Delivery State

Delivery state becomes the production permission model:

- `shadow_only`
- `conservative_only`
- `eligible`
- `quarantined`

Delivery state is authoritative for live injection eligibility.

### Default mapping

- `candidate -> shadow_only`
- `priority_candidate -> conservative_only`
- `active -> eligible`
- `cooling -> conservative_only`
- `retired -> quarantined`

### Runtime path

The live decision path becomes:

1. load exact-scope nodes
2. filter by `delivery_state`
3. retrieve and rank candidates
4. apply hard production gates
5. optionally apply selective sync LLM second opinion in high-risk cases
6. emit `inject`, `inject_conservative`, or `skip`

### Finalize path

The finalize path becomes:

1. persist run, input, outcome, and injection records
2. apply deterministic automatic feedback
3. schedule async posttask review
4. accept bounded per-node recommendations
5. apply policy-gated writeback
6. update lifecycle state and delivery state

## Delivery State Semantics

### `shadow_only`

- not eligible for live prompt injection
- visible to inspect, evaluation, and shadow analysis
- default state for ordinary new `candidate` nodes

### `conservative_only`

- eligible only for single-node conservative injection
- no multi-hint injection
- no cluster fast path
- used for `priority_candidate` and `cooling`

### `eligible`

- fully eligible for normal live injection
- reserved for mature `active` nodes

### `quarantined`

- blocked from live injection
- blocked from conservative live injection
- still visible to inspect and review
- can only return through explicit review or strong positive evidence

## Candidate And Priority-Candidate Policy

Ordinary `candidate` nodes are not allowed into live tasks. This is the main production-protection change.

EE still preserves cold-start value through `priority_candidate`, which acts as a bounded canary state.

### Entering `priority_candidate`

A new node may enter `priority_candidate` only if all of the following are true:

- `promotion_signal = high_value`
- source task outcome was `success`
- `success_signal` is present
- the experience includes structured guidance such as `goal`, `recommended_steps`, `avoid_steps`, or `fallback_steps`
- the experience is exact-scope applicable
- the task family is exact or the node is a narrow `expectation_correction`
- no harm history exists
- the origin profile is not predominantly meta-only or validation-only

### `priority_candidate` live budget

- only `inject_conservative`
- only one node at a time
- no bundled hints
- no repeated live reuse until the prior launch has received adjudication

This makes `priority_candidate` a canary release, not a soft version of `active`.

## Feedback Model

The feedback model changes from an implicit binary to an explicit three-state verdict:

- `helped`
- `harmed`
- `uncertain`

### Automatic feedback rules

- success does not automatically count as `helped`
- success produces `uncertain` by default unless a future deterministic rule is added with very high confidence
- failure with strong relevant harm evidence counts as `harmed`
- `uncertain` updates usage and review history, but does not increment `helped_count` or `harmed_count`

### Explicit user feedback

User feedback remains high-authority:

- `mark_helped` can promote a conservative node
- `mark_harmed` can immediately reduce delivery permission

## Harm Circuit Breakers

The product needs recent-risk protection, not just lifetime arithmetic.

The following circuit breakers apply:

- `consecutive_harmed_count >= 2` => `delivery_state = quarantined`
- recent repeated harm without recent help => `delivery_state = quarantined`
- explicit user `mark_harmed` on a live-eligible node => at least `conservative_only`
- `priority_candidate` with one medium/high-confidence harmed verdict => `quarantined`

These gates protect current work before any decision is made about retirement.

## LLM Posttask Adjudication

LLMs should primarily participate after the task completes.

The posttask worker should no longer only return a task-level artifact. It should also return bounded per-node adjudication for injected nodes.

### Required posttask output extension

The posttask schema should include `injected_node_reviews[]`, where each entry includes:

- `node_id`
- `feedback_verdict: helped | harmed | uncertain`
- `confidence: high | medium | low`
- `delivery_recommendation: keep | conservative_only | quarantine | review`
- `reason`
- `evidence_summary`

### Runtime ownership

The runtime remains the only writeback owner.

The worker:

- does not mutate lifecycle state directly
- does not mutate delivery state directly
- does not emit raw SQL-like or imperative write commands

The runtime:

- validates the worker output
- applies product policy
- writes review events
- updates counts and state transitions

## Selective Sync LLM Review

Hot-path LLM review is allowed only as a later phase and only for bounded risk cases.

It should run only when one or more of these conditions are true:

- top candidate has harm history
- top candidate is `conservative_only`
- score margins are narrow
- the task indicates expectation correction
- the task is high impact and a wrong hint is unusually expensive

The output must be constrained to:

- `allow`
- `allow_conservative`
- `skip`
- `best_node_id`

This prevents sync LLM use from becoming an unbounded policy engine.

## Data Model Changes

### `experience_nodes`

Add:

- `delivery_state`
- `consecutive_harmed_count`
- `last_feedback_verdict`
- `quarantined_at`
- `quarantine_reason`

### `review_events`

Extend `event_type` with:

- `mark_uncertain`
- `quarantine`
- `restore_conservative`
- `restore_eligible`

Optional future extensions may add `confidence` and `reason`, but they are not required for phase 1.

## Migration Strategy

This should be an additive migration.

Backfill rules:

- `candidate -> shadow_only`
- `priority_candidate -> conservative_only`
- `active -> eligible`
- `cooling -> conservative_only`
- `retired -> quarantined`

No existing lifecycle state should be removed during phase 1.

## Implementation Phases

### Phase 1: Production gating

Land the minimum live-safety model:

- add `delivery_state`
- route live retrieval through `delivery_state`
- ordinary `candidate` nodes become `shadow_only`
- `priority_candidate` remains the only early live path
- remove `success => auto helped`

Expected result:

- harmful early-stage nodes stop reaching live tasks by default
- good early-stage nodes still have a canary path

### Phase 2: Feedback governance refactor

- add explicit `helped | harmed | uncertain`
- update lifecycle/delivery projection helpers
- wire explicit user feedback into delivery-state changes
- implement circuit breakers

Expected result:

- repeated harm removes nodes from live exposure quickly
- successful tasks no longer over-credit injected hints

### Phase 3: LLM posttask writeback

- extend posttask schema to per-node reviews
- accept bounded per-node review output
- policy-gate runtime writeback

Expected result:

- posttask feedback becomes materially more accurate
- EE can distinguish `helped` from `uncertain` on successful runs

### Phase 4: Selective sync LLM second opinion

- only for high-risk ambiguous cases
- keep output constrained and runtime-owned

Expected result:

- fewer borderline live misfires without making the full hot path model-dependent

## Testing Requirements

At minimum, the implementation must prove:

- `candidate` nodes do not inject live
- `candidate` nodes remain visible in shadow/evaluation paths
- `priority_candidate` injects only conservatively and only one at a time
- `priority_candidate` can promote to `active` after high-confidence positive adjudication
- `priority_candidate` is removed from live exposure after harmful adjudication
- `cooling` nodes do not normal-inject
- repeated harm quarantines a node
- successful tasks do not auto-increment `helped_count`
- posttask `uncertain` does not change helped/harmed counts
- accepted posttask per-node reviews write back deterministically

## Risks

### Lower recall risk

Moving `candidate` to `shadow_only` reduces early live recall.

Mitigation:

- preserve `priority_candidate` canary launch
- keep shadow visibility and evaluation visibility
- promote only the best new experience into `priority_candidate`

### Over-quarantine risk

Aggressive circuit breakers can remove useful nodes too quickly.

Mitigation:

- require confidence-aware harmful adjudication
- allow explicit user recovery
- restore only to `conservative_only` first

### Product complexity risk

Two state axes are more complex than one.

Mitigation:

- lifecycle and delivery serve different responsibilities
- inspect/status should surface both clearly
- runtime should be the single mutation owner

## Recommendation

Implement this design in three code phases before considering any broader architecture change:

1. production gating
2. feedback governance refactor
3. LLM posttask writeback

This is the smallest path that materially improves product reliability without discarding EE's ability to surface fresh, high-value experience.
