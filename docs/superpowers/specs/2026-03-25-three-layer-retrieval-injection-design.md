# Three-Layer Retrieval And Injection Design

Date: 2026-03-25

## Summary

ExperienceEngine's current retrieval pipeline can already find relevant mature nodes, but the final trigger gate is too lexical and too strict. In real Codex runs, `retrieveCandidates()` returns the expected `payments auth test` nodes, yet `evaluateTrigger()` still returns `skip` because long task prompts have low token overlap with short `trigger_pattern` strings.

The product goal is not "make retrieval more complicated." The goal is:

1. Relevant experience should reliably inject.
2. Weak or noisy candidates should still be filtered.
3. Injection decisions should remain explainable and governable.

This design moves EE to a three-layer architecture:

1. stronger candidate retrieval
2. lighter selective gate
3. strong-candidate fast path

The final target is all three layers. The first implementation phase will land layers 2 and 3 first, because they address the current real blocker directly.

## Problem

Current runtime behavior has three distinct stages:

1. candidate retrieval
2. trigger evaluation
3. intervention decision

The problem is not stage 1. In live Codex runs:

- mature candidates are retrieved
- same-scope and same-task-family nodes are present
- nodes have positive `helped_count` and valid history

But stage 2 rejects them because it compares a long task prompt against a short `trigger_pattern` using token overlap with an effective threshold that is still too high for natural prompts.

This causes a product-visible failure:

- EE appears connected
- the agent calls EE correctly
- but experience still does not inject when users reasonably expect it to

That makes the system feel unreliable even though the data and retrieval layers are partially working.

## Product Goals

### Primary goals

- Improve recall for clearly related tasks.
- Preserve precision for weak or uncertain matches.
- Make injection decisions more explainable than a pure black-box threshold.
- Keep the runtime path host-agnostic so the same core logic serves Codex, Claude Code, and OpenClaw.

### Non-goals for this change

- No pack/compiler revival.
- No hook simulation for Codex.
- No opaque model-routed retrieval gate in the first iteration.
- No requirement that every host adopt a different retrieval policy.

## Final Architecture

### Layer 1: Stronger Candidate Retrieval

This layer is responsible for recall.

It should combine:

- semantic retrieval from embeddings
- lexical retrieval from BM25 or equivalent sparse retrieval
- rank fusion across retrieval channels
- optional reranking interface for later use

The output of this layer is not just a node list. It must also emit candidate-quality features that later layers can use:

- semantic score
- lexical score
- fused score
- task family match
- scope alignment
- node state
- helped/harmed summary
- validation state

This layer answers:

> "Which nodes are plausibly relevant?"

### Layer 2: Lighter Selective Gate

This layer is responsible for injection discipline.

It should stop acting like a second retrieval system. Instead of heavily relying on token overlap between the full task prompt and `trigger_pattern`, it should decide whether injection is worth attempting based on candidate quality and confidence.

It should consider:

- top candidate fused score
- score margin between top 1 and top 2
- task family match
- scope match
- node state
- helped/harmed balance
- validation state
- runtime risk signals such as failure evidence, retries, or user correction

This layer answers:

> "Given the candidates we found, should we inject, inject conservatively, or skip?"

### Layer 3: Strong-Candidate Fast Path

This layer prevents obvious false negatives.

If a candidate is already strong enough by product standards, it should not be vetoed by a coarse lexical rule. This applies when a node has strong evidence such as:

- same scope
- same task family
- `state = active`
- positive helped history
- validated reuse or equivalent maturity
- a clearly leading retrieval score

In these cases EE should:

- inject directly
- or at minimum inject conservatively

This layer answers:

> "Do we already know enough to avoid an unnecessary skip?"

## Target Decision Model

The runtime decision path should become:

1. retrieve candidates
2. compute candidate-quality signals
3. if strong-candidate fast path applies, inject or inject conservatively
4. otherwise run the lighter selective gate
5. emit `inject`, `inject_conservative`, or `skip`

This makes the architecture easier to reason about:

- layer 1 finds possibilities
- layer 2 controls general selectivity
- layer 3 protects obvious wins from over-filtering

## Phase Plan

### Phase 1: Fix The Current Product Failure

This phase lands layers 2 and 3.

Scope:

- weaken or replace the current lexical-heavy trigger gate
- add strong-candidate fast-path rules
- keep current embedding retrieval in place
- expose decision reasons in diagnostics

Expected result:

- currently retrieved mature nodes can inject
- Codex stops skipping obviously related experience
- precision remains controlled through candidate-quality rules rather than a hard overlap threshold

### Phase 2: Strengthen Retrieval

This phase lands layer 1.

Scope:

- lexical/BM25 retrieval
- rank fusion with embedding retrieval
- optional rerank interface

Expected result:

- better recall across paraphrases
- more robustness for long prompts, short trigger patterns, and vocabulary mismatch

## Diagnostics And Explainability

This design requires better observability so that EE can explain why it injected or skipped.

Diagnostics should expose:

- top candidates
- semantic score
- lexical score when available
- fused score
- task family match
- gate reason
- whether strong-candidate fast path applied
- final decision reason

Relevant product surfaces:

- `ee inspect --last`
- `ee doctor`
- internal intervention scorecard records

Without this, retrieval changes will remain hard to tune and hard to trust.

## Product Impact

After phase 1, users should experience:

- fewer "obvious miss" skips
- more stable injections on repeated task families
- better trust that mature nodes actually matter

After phase 2, users should experience:

- stronger recall across phrasing differences
- fewer brittle prompt-wording failures
- more consistent retrieval quality across hosts

## Risks

### Over-injection risk

If the fast path is too permissive, EE may inject weak guidance too often.

Mitigation:

- require maturity and strong history signals
- keep `inject_conservative` as a fallback
- record decision reasons and monitor helped/harmed

### Hidden precision regressions

If retrieval and gating both change at once, regressions become hard to attribute.

Mitigation:

- implement phase 1 first
- defer retrieval expansion to phase 2
- preserve explainable scoring

### Host behavior divergence

Different hosts may expose the same task differently.

Mitigation:

- keep retrieval and gate logic host-agnostic
- rely on normalized task and evidence signals

## Recommendation

Adopt the three-layer architecture as the product target.

Implement it in two phases:

1. phase 1 now: lighter gate plus strong-candidate fast path
2. phase 2 next: stronger retrieval with lexical/hybrid fusion

This keeps the product direction aligned with the final desired behavior while solving the current real failure mode immediately.
