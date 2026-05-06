## 1. Baseline And Compatibility

- [x] 1.1 Add or identify golden tests that cover current candidate retrieval and intervention decisions across no-match, active, conservative, diagnostic, and gated rejection cases.
- [x] 1.2 Capture current scorecard and diagnostics expectations before routing through new retrieval-policy helpers.
- [x] 1.3 Confirm Phase A does not change prompt text, injected node ids, delivery flags, intervention strength, or injection modes.

## 2. RetrievalContext

- [x] 2.1 Add a minimal `RetrievalContext` type with stable fields sourced from existing runtime input.
- [x] 2.2 Add `buildRetrievalContext()` without replacing `ExperienceInput` or changing host adapter contracts.
- [x] 2.3 Treat host, tool names, failure signature, read-only intent, and module paths as optional/opportunistic evidence.

## 3. Stage Helpers

- [x] 3.1 Introduce explicit helper boundaries for hard filtering, shortlisting, policy enrichment, and decision assembly.
- [x] 3.2 Preserve existing ranking, query rewrite, candidate merge, and intervention-controller behavior inside the new stage structure.
- [x] 3.3 Keep current delivery-state, repo-policy, destructive-risk, shadow, holdout, and diagnostic-live gates authoritative.

## 4. Diagnostics And Inspection

- [x] 4.1 Add additive stage-level reasons to existing diagnostics or scorecard structures where compatible.
- [x] 4.2 Avoid prompt text changes and avoid dumping full retrieval internals into injected guidance.
- [x] 4.3 Add tests proving diagnostics are additive and existing inspection output remains stable unless intentionally extended.

## 5. Validation

- [x] 5.1 Run targeted retrieval/intervention tests.
- [x] 5.2 Run `openspec validate stage-retrieval-policy-v2-phase-a --strict`.
- [x] 5.3 Run `pnpm typecheck` and `pnpm build`; document any known Windows temp-directory test failures if full `pnpm check` still fails for environment reasons.
