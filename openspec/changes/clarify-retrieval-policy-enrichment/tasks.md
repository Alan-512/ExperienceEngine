## 1. Baseline

- [x] 1.1 Add or identify tests that freeze current policy adjustment values and candidate order.
- [x] 1.2 Confirm intervention-controller representative cases keep the same mode, selected ids, strength, and prompt text.

## 2. Structured Components

- [x] 2.1 Add policy component types with stable names, categories, signed values, and reasons.
- [x] 2.2 Emit components from `enrichPolicyForCandidate()` while preserving existing `policyAdjustment`, `policyScore`, and `reasons`.
- [x] 2.3 Represent negative evidence such as generic and meta-origin penalties as explicit negative components.

## 3. Compatibility

- [x] 3.1 Ensure component totals equal the existing enriched policy adjustment.
- [x] 3.2 Thread components through retrieved candidate score metadata where useful without changing prompt text.
- [x] 3.3 Keep retrieval-context fields as soft evidence only.

## 4. Validation

- [x] 4.1 Run targeted policy/retrieval/intervention tests.
- [x] 4.2 Run `openspec validate clarify-retrieval-policy-enrichment --strict`.
- [x] 4.3 Run `pnpm typecheck` and `pnpm build`.
