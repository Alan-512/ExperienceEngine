# Best-Practice Retrieval Architecture Design

Date: 2026-03-26

## Summary

ExperienceEngine's retrieval stack has now moved beyond a single embedding lookup. It already includes:

- dense semantic retrieval
- lexical/BM25-style sparse scoring
- hybrid fusion
- a rerank interface
- a lighter candidate-quality gate
- a strong-candidate fast path

That is a meaningful improvement over the previous "embedding + lexical veto" design, but it is still not the final product target.

Recent real Codex validation shows two remaining gaps:

1. some close paraphrases still skip when users expect injection
2. investigation-style prompts can leak misleading runtime signals into the learning loop

The first gap is a retrieval architecture issue. The second is an input/outcome classification bug, but it matters because it pollutes the learning loop and reduces trust in retrieval quality.

The final product target should align with current best-practice RAG/retrieval systems:

1. hybrid retrieval as the baseline
2. reranking as a first-class stage, not just an optional hook
3. query rewriting or contextual retrieval for paraphrase robustness
4. selective retrieval/routing that decides when retrieval is worth using
5. explainable diagnostics across every stage

This document defines that final product architecture.

## Current Completion Status

The current repository has already implemented a substantial portion of this architecture.

### Already implemented

- Layer 0 input hygiene for investigation-style prompts
- hybrid first-stage retrieval with:
  - dense semantic retrieval
  - lexical / BM25-style sparse scoring
  - fused ranking
- bounded contextual query rewriting for long investigation and read-only prompts
- reranking as a real retrieval stage rather than a dormant extension point
- candidate-quality selective gate
- strong-candidate fast path
- operator-visible diagnostics in:
  - `ee inspect --last`
  - `ee doctor`
  - `ee status`
- real Codex-host validation showing:
  - natural lookup
  - live inject
  - query rewrite participation
  - rerank participation
  - fast-path activation

### What this means

The current product is no longer at the "simple retrieval stack" stage.

It now has a best-practice-directed production architecture that is already capable of:

- recovering close paraphrases better than before
- avoiding the previous lexical-gate false negatives
- exposing retrieval decisions in an operator-readable way

However, that does **not** mean the final best-practice target is fully complete.

The current system should be described as:

> a production-capable best-practice-oriented retrieval architecture,
> not yet a fully maxed-out best-practice retrieval stack

## Why The Current Stack Is Not Yet Best Practice

The current EE stack is stronger than before, but it is still an intermediate stage.

### What is already in place

- dense retrieval from embeddings
- lexical retrieval from sparse token matching
- fused scoring across dense and sparse signals
- candidate-quality gate instead of a purely lexical veto
- strong same-family fast path
- scorecard diagnostics for semantic, lexical, and fused signals

### What is still missing

- a production reranker that actually participates in ranking, not only an interface
- query rewriting or contextual retrieval for long or paraphrased prompts
- a more explicit selective-retrieval policy for investigation vs fix vs validation tasks
- a clearer separation between retrieval relevance and runtime outcome classification

### Product consequence

The system can now recover many obvious misses, but it still does not behave like the strongest retrieval systems in the wild. In particular:

- prompt wording still matters too much
- investigation prompts are not treated distinctly enough
- rerank has no default product behavior yet

## Best-Practice Reference Model

The target architecture is consistent with current public guidance from retrieval and RAG systems:

- hybrid retrieval beats dense-only retrieval for robustness
- reranking remains important after hybrid retrieval
- selective retrieval and query classification improve both quality and latency
- contextual retrieval or query rewriting improves matching when prompts use different surface forms

For EE, this means the target is not "more heuristics." The target is a layered retrieval system where each stage has a clear job.

## Product Goals

### Primary goals

- Relevant experience should inject reliably across paraphrases.
- Weak candidates should still be filtered.
- Investigation-style tasks should not pollute the experience loop with false failure signals.
- Retrieval decisions should remain inspectable and governable.
- The same retrieval core should serve Codex, Claude Code, and OpenClaw.

### Non-goals

- No return to static compiled experience documents as a primary path.
- No host-specific retrieval stacks.
- No opaque black-box routing that removes operator visibility.

## Final Architecture

### Layer 0: Input Normalization And Outcome Hygiene

This layer sits before retrieval.

Its job is to ensure the system does not confuse:

- task description
- investigation intent
- observed runtime failure

It should normalize:

- task summary
- context summary
- task intent
- outcome signal

This layer must explicitly separate:

- "this task is about a regression"
- from
- "this session already observed a failure"

Without this separation, the learning loop gets polluted and retrieval quality becomes harder to interpret.

### Layer 1: Hybrid Candidate Retrieval

This layer is responsible for recall.

It should combine:

- dense semantic retrieval
- sparse lexical retrieval
- rank fusion or equivalent hybrid fusion

Its job is:

> find all plausible candidate nodes worth considering

This layer should emit structured candidate metadata, including:

- semantic score
- lexical score
- fused score
- scope match
- task family match
- state
- helped/harmed balance
- validation state

### Layer 2: Query Rewriting / Contextual Retrieval

This layer improves robustness when user prompts differ from stored trigger patterns.

It should support:

- query expansion
- paraphrase normalization
- optional contextual query enrichment

The goal is not to create long synthetic prompts for every task. The goal is to give retrieval a better query representation when the raw prompt is likely to underperform.

Typical triggers for this layer:

- long investigation prompts
- read-only analysis prompts
- prompts with extra procedural instructions
- prompts using different surface language for the same core task

Its job is:

> reduce semantic mismatch between the live task wording and the stored experience wording

### Layer 3: Reranking

This layer is responsible for precision after recall.

Its job is:

> take the top hybrid candidates and decide which are truly most relevant

This should be a first-class product stage, not only an extension point.

The reranker should be allowed to use richer signals than the base retriever:

- task summary
- context summary
- candidate trigger pattern
- candidate compact hint
- candidate maturity signals

The reranker does not replace hybrid retrieval. It refines it.

### Layer 4: Selective Retrieval Gate

This layer decides whether injection is worth attempting at all.

Its job is:

> decide inject / inject_conservative / skip based on candidate quality and task conditions

It should rely primarily on:

- top candidate quality
- top-1 vs top-2 margin
- task family match
- scope match
- node maturity
- helped/harmed history
- runtime risk signals

It should not behave like a second coarse retrieval system.

### Layer 5: Strong-Candidate Fast Path

This layer protects obvious wins.

If the top candidate is clearly trustworthy by product standards, it should not be vetoed by a weaker downstream rule.

Typical fast-path signals:

- same scope
- same task family
- active state
- validated reuse
- positive helped history
- clear fused/rerank lead

Its job is:

> prevent false negatives when the system already knows enough

## Remaining Gap To The Full Best-Practice Target

The current implementation is intentionally short of the fully expanded end-state in a few places.

### 1. Lexical retrieval is BM25-style, not a full standalone BM25 subsystem

The current lexical layer already captures the product benefits of sparse matching and fusion.

What is still missing from the strongest possible implementation:

- a more explicit, separately tunable BM25 retrieval subsystem
- clearer per-field sparse weighting
- more formal rank-fusion calibration across dense and sparse channels

### 2. Reranking is productized, but not yet model-grade

The current rerank stage is:

- bounded
- explainable
- stable
- integrated into scorecards and diagnostics

That is good product engineering, but it is not yet the strongest available form.

What a fuller best-practice implementation would still add:

- a dedicated reranker provider or model
- cross-encoder or equivalent model-grade reranking
- optional higher-cost precision mode for difficult close-match tasks

### 3. Contextual retrieval is query-side only

The current implementation rewrites the retrieval query.

That is useful and already improves paraphrase robustness, but it is not yet the most complete contextual retrieval design.

What is still missing:

- richer contextual expansion
- optional document-side or node-side contextualization
- stronger handling of long workflow prompts with multiple procedural clauses

### 4. Selective routing is still deterministic policy, not advanced learned routing

The current gate is much better than the old lexical veto, but it is still an explicit rule-driven selector.

What is still missing from a heavier best-practice end-state:

- uncertainty-aware retrieval gating
- richer query classification
- optional self-routing or probing-style routing for ambiguous tasks

### 5. Cross-host acceptance is still Codex-heavy

The current strongest real-host validation is on Codex.

What the final target would still benefit from:

- more repeated OpenClaw validation on the upgraded retrieval path
- more repeated Claude Code validation on the upgraded retrieval path
- comparative diagnostics across hosts using the same task families

## Product Positioning Of The Current State

To avoid ambiguity, the current state should be described as follows:

- It is **not** the old simplified retrieval stack.
- It **is** a real best-practice-oriented production retrieval architecture.
- It is **not yet** the fully maxed-out end-state version of best practice.

That means:

- product claims about hybrid retrieval, contextual rewriting, reranking, selective gating, and strong-candidate fast path are now justified
- claims about a fully mature BM25 subsystem, model-grade reranking, and advanced learned routing are not yet justified

## Product Decision Flow

The final runtime path should become:

1. normalize input and runtime intent
2. retrieve hybrid candidates
3. optionally rewrite/enrich the retrieval query when needed
4. rerank the top hybrid candidates
5. if strong-candidate fast path applies, inject or inject conservatively
6. otherwise run the selective retrieval gate
7. emit explainable diagnostics

## Diagnostics Requirements

The final product must expose enough state to explain retrieval behavior.

Relevant surfaces:

- `ee inspect --last`
- `ee doctor`
- `ee status`
- internal scorecard storage

Diagnostics should eventually include:

- whether query rewriting/contextual retrieval was used
- semantic score
- lexical score
- fused score
- rerank score
- top-1/top-2 margin
- gate reason
- fast-path applied
- final decision reason

Without this, the system will remain hard to tune and hard to trust.

## Phase Plan

### Phase A: Fix Input Hygiene

Scope:

- stop investigation prompts from being pre-labeled as failures
- separate prompt wording from observed runtime outcome
- make investigation/fix/validation intent more explicit

Expected result:

- cleaner task runs
- cleaner candidate generation
- less misleading runtime evidence

### Phase B: Complete Retrieval Best Practices

Scope:

- keep hybrid retrieval as baseline
- promote reranking from interface to actual product stage
- add query rewriting/contextual retrieval for paraphrase robustness
- keep selective gate and fast path explainable

Expected result:

- better recall across paraphrases
- more stable Codex injections on long/noisy prompts
- fewer wording-sensitive skips

### Phase C: Tune With Runtime Evidence

Scope:

- compare inject vs skip behavior on real tasks
- monitor helped/harmed after retrieval changes
- tune gate thresholds and rerank weighting from observed outcomes

Expected result:

- better product stability
- less guesswork in retrieval tuning

## Risks

### Complexity risk

Adding every best-practice layer without preserving observability will make the system harder to debug.

Mitigation:

- each layer must emit diagnostics
- keep each stage narrow in purpose

### Over-injection risk

More retrieval power can increase noisy injections.

Mitigation:

- selective gate stays explicit
- fast path still requires maturity
- helped/harmed continues to govern lifecycle

### Overfitting to benchmark prompts

If query rewriting and reranking are tuned only on internal regression phrases, the product may become brittle again.

Mitigation:

- validate on multiple prompt styles
- include investigation, fix, validation, and read-only variants

## Recommendation

Adopt this architecture as the final retrieval product target:

1. input hygiene
2. hybrid retrieval
3. contextual/query rewriting
4. reranking
5. selective gate
6. strong-candidate fast path

The next work should start with Phase A, because investigation prompts are currently contaminating the runtime loop. After that, the retrieval stack should be upgraded from "hybrid with a rerank hook" to "hybrid + real reranking + contextual retrieval."
