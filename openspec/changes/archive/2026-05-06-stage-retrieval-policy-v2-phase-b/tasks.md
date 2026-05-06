## 1. Spec And Baseline

- [x] 1.1 Update retrieval-policy spec purpose from placeholder wording during archive or pre-archive spec sync.
- [x] 1.2 Add tests that freeze the current Phase A stage diagnostics before Phase B behavior changes.

## 2. Lexical Shortlist Stage

- [x] 2.1 Extract a lexical shortlist helper over the hard-filtered pool.
- [x] 2.2 Add thresholds/top-k behavior that keeps strong lexical candidates in the primary shortlist.
- [x] 2.3 Add diagnostics for lexical shortlist accepted/rejected counts and reason codes.

## 3. Semantic Rerank And Backfill

- [x] 3.1 Restrict semantic scoring to lexical shortlist candidates by default.
- [x] 3.2 Add bounded semantic backfill when lexical evidence is weak or empty.
- [x] 3.3 Label semantic mode in diagnostics as skipped, rerank, or backfill.

## 4. Governance Compatibility

- [x] 4.1 Prove semantic-only candidates cannot bypass hard filters, repo policy, destructive-risk checks, or intervention gates.
- [x] 4.2 Preserve prompt text, delivery flags, intervention strength, and selected node ids for existing representative intervention-controller cases.

## 5. Validation

- [x] 5.1 Run targeted retrieval/intervention tests.
- [x] 5.2 Run `openspec validate stage-retrieval-policy-v2-phase-b --strict`.
- [x] 5.3 Run `pnpm typecheck` and `pnpm build`.
