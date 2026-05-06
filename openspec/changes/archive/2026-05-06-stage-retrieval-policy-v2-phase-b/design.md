## Overview

Phase B changes retrieval behavior, but only inside the already bounded hard-filtered pool. The key move is:

```text
hard-filtered nodes
  -> lexical shortlist
  -> semantic rerank over shortlist
  -> bounded semantic backfill only when lexical evidence is weak
  -> policy enrichment
  -> existing intervention decision gates
```

## Non-Goals

- No shared/global fallback pool.
- No new database columns or node metadata requirements.
- No agentic search.
- No prompt wording changes.
- No change to delivery-state, repo-policy, destructive-risk, diagnostic-live, or second-opinion authority.

## Lexical Shortlist

The lexical stage should score every hard-filtered node using existing lexical scoring. It should produce a shortlist based on a conservative top-k window and a minimum lexical signal.

The implementation should preserve nodes with strong existing lexical overlap and should not require new metadata. Existing `retrieval_text`, trigger pattern, compact hint, goal, and structured steps remain the source text.

## Semantic Rerank And Backfill

Semantic retrieval should run against:

- the lexical shortlist when lexical evidence exists
- a bounded backfill pool when lexical evidence is weak or empty

Semantic-only candidates may enter the scored set only through the explicit backfill path and must still pass policy/gate stages before any intervention can occur.

## Low-Signal Handling

Low-signal prompt-only input should avoid unnecessary semantic embedding work. Diagnostics should state that semantic retrieval was skipped because of low-signal input, not because governance blocked the task.

If lexical evidence is also absent, the result should be an empty candidate set unless a later spec introduces a separate fallback pool.

## Diagnostics

Retrieval policy diagnostics should distinguish:

- lexical shortlist accepted/rejected counts
- semantic mode: skipped, rerank, or backfill
- whether semantic-only candidates were allowed into the scored set
- policy enrichment remains separate from retrieval similarity

## Compatibility

Existing intervention-controller tests should continue to pass. Retrieval tests should prove:

- lexical-first candidates remain preferred over semantic-only candidates when lexical evidence is strong
- semantic backfill can recover a useful candidate when lexical evidence is weak
- low-signal inputs skip semantic work and do not inject unrelated nodes
- high semantic similarity alone does not bypass governance gates
