## Why

Phase A made retrieval-policy stages observable without changing behavior. The next step is to make lexical/sparse shortlist the explicit first recall stage so semantic retrieval is used for rerank/backfill rather than acting as the implicit primary recall authority.

## What Changes

- Introduce lexical-first shortlist behavior over the hard-filtered pool.
- Restrict semantic retrieval to reranking the lexical shortlist plus bounded backfill when lexical evidence is weak or absent.
- Move low-signal semantic skipping into the retrieval-policy stage contract with diagnostics explaining when semantic work was skipped or used as backfill.
- Preserve existing governance authority: delivery-state gates, repo policy, destructive-risk checks, diagnostic-live gates, and intervention-controller decisions remain final.
- Do not introduce shared/global fallback pools, new node metadata fields, database migrations, or agentic search.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `experience-retrieval-policy`: Adds Phase B lexical-first shortlist and semantic rerank/backfill requirements.

## Impact

- Affected code is expected to stay mostly in `src/controller/candidate-retriever.ts` and focused retrieval tests.
- Public CLI/MCP behavior and prompt rendering should remain unchanged except for additive retrieval-policy diagnostics.
- Documentation/spec cleanup includes replacing the placeholder purpose in `openspec/specs/experience-retrieval-policy/spec.md` when this change is archived.
