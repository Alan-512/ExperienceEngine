## Overview

Retrieval Policy v2 Phase A is a structural refactor. The goal is to expose the retrieval and policy pipeline that already exists implicitly, while preserving current behavior and keeping later ranking or gate changes out of this slice.

The target shape is:

```text
ExperienceInput + host/task context
  -> buildRetrievalContext()
  -> hardFilterNodes()
  -> shortlistCandidates()
  -> preserve existing ranking/rerank behavior
  -> policyEnrichCandidates()
  -> assemble existing intervention decision
  -> persist existing diagnostics plus stage-level reasons
```

## Boundaries

Phase A must not:

- replace `ExperienceInput` as the runtime entry contract
- introduce shared/global fallback pools
- change query rewrite semantics
- change lexical, semantic, or fusion ranking outcomes
- change `InjectionMode`, delivered flags, injected node ids, intervention strength, or prompt text
- turn inferred signals such as read-only intent, module paths, tool names, or failure signatures into hard filters
- add a new database table

Phase A may:

- add a `RetrievalContext` object built from currently available inputs
- add helpers for explicit stage naming and diagnostics
- route existing retrieval logic through those helpers when tests prove output compatibility
- persist or expose stage-level reasons where existing scorecard/diagnostic shapes already support extension

## RetrievalContext

`RetrievalContext` should be a parallel object for retrieval, policy, and explainability. It should not replace `ExperienceInput` in Phase A.

Minimum stable fields:

- `scopeId`
- `taskType`
- `taskSummary`
- `contextSummary`
- `outcomeSignal`
- `injectedNodeIds`

Opportunistic fields:

- `host`
- `toolNames`
- `failureSignature`
- `isReadOnly`
- `modulePaths`

Missing opportunistic fields must degrade gracefully. Absence of `toolNames`, `failureSignature`, module paths, or read-only inference must not cause a skip by itself.

## Stage Ownership

- `candidate-retriever` owns retrieval preparation, context construction, query rewrite compatibility, and shortlist assembly.
- `node-ranker` may remain the compatibility ranking implementation while stage wrappers are introduced.
- `intervention-controller` owns final candidate merge, budget selection, delivery-state policy, and decision assembly.
- `injection-scorecard` owns persisted decision diagnostics and may include stage-level reasons without dumping full internals into prompt text.

## Compatibility Tests

The first implementation should add golden tests around representative current scenarios before routing through new helpers:

- no matching nodes
- active same-scope guidance
- conservative/cooling guidance
- candidate diagnostic record-only and gated diagnostic delivery
- shadow/holdout/live evaluation modes
- cross-scope or risky candidate rejection

For each case, compare mode, delivered flag, injected node ids, selected/rejected candidates, intervention strength, and key scorecard fields.

## Later Phases

Phase B can then make behavior changes deliberately, such as lexical shortlist ordering, low-signal semantic handling, or fallback pool semantics. Those changes should get their own OpenSpec change and tests.
