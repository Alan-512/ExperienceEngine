## Why

ExperienceEngine now has a usable production governance loop, but retrieval and policy decision logic still share implicit scoring and diagnostics boundaries. Retrieval Policy v2 Phase A should make the staged retrieval contract explicit without changing live intervention behavior.

## What Changes

- Introduce a new retrieval-policy capability that defines the staged retrieval contract for `RetrievalContext`, explicit hard filtering, candidate shortlisting, policy enrichment, decision assembly, and outcome diagnostics.
- Keep Phase A behavior-preserving: existing `ExperienceInput`, node pools, query rewrite behavior, delivery gates, injection modes, score thresholds, prompt rendering, and persisted decisions remain source-compatible.
- Add tests that compare existing retrieval/intervention outputs before and after the structural split.
- Defer behavior-changing retrieval improvements such as lexical-first ranking changes, low-signal semantic skipping, shared/global fallback pools, and new hard filters to later phases.

## Capabilities

### New Capabilities

- `experience-retrieval-policy`: Defines ExperienceEngine's staged retrieval and policy enrichment contract, including behavior-preserving Phase A boundaries.

### Modified Capabilities

- `experience-intervention-governance`: No requirement change in Phase A; existing delivery and injection behavior must remain stable while retrieval structure is made explicit.

## Impact

- Affected code will likely include `src/controller/candidate-retriever.ts`, `src/controller/intervention-controller.ts`, `src/controller/node-ranker.ts`, scorecard diagnostics, and focused unit tests.
- No database migration, dependency change, host adapter contract change, or public CLI/MCP behavior change is expected in Phase A.
