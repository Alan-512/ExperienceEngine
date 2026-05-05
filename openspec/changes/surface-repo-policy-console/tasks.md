## 1. Policy Evidence Read Model

- [x] 1.1 Define structured repo policy inspection types for state, restore guidance, evidence summary, and evidence entries.
- [x] 1.2 Reuse or add repository methods that return recent attribution evidence entries for a scope with node and injection references.
- [x] 1.3 Reuse or add repository methods that return recent fallback injection evidence entries for a scope.
- [x] 1.4 Add a pure evidence summarizer that merges attribution and fallback evidence, suppresses duplicate fallback entries for the same injection, caps the window at 20, and counts verdicts/sources.
- [x] 1.5 Add unit tests for evidence windowing, source labeling, manual override labeling, duplicate fallback suppression, verdict counts, and no-evidence behavior.

## 2. Interaction Surface

- [x] 2.1 Add `inspectRepoPolicy` or equivalent structured method to `ExperienceInteractionService`.
- [x] 2.2 Include policy state, bounded evidence summary, recent evidence entries, and restore guidance.
- [x] 2.3 Ensure inspection is read-only and does not write repo policy, attribution, injection, review, or node records.
- [x] 2.4 Extend repo summary to include the evidence-aware policy summary without changing existing summary fields.
- [x] 2.5 Add interaction-service tests for clear policy, tripped policy, mixed attribution/fallback evidence, and read-only behavior.

## 3. CLI And Operator Output

- [x] 3.1 Extend `ee inspect repo` output to show repo policy state and evidence-aware circuit details.
- [x] 3.2 Keep restore behavior explicit through `ee config restore repo-policy` and align help/restore wording only.
- [x] 3.3 Ensure CLI wording distinguishes automatic attribution from manual override evidence and fallback injection evidence.
- [x] 3.4 Add inspect/config command tests for clear policy, tripped policy, evidence rows, manual override wording, and restore guidance.

## 4. Validation

- [x] 4.1 Run `pnpm vitest run tests/unit/repo-policy.test.ts tests/unit/interaction-service.test.ts tests/unit/inspect-command.test.ts tests/unit/config-command.test.ts`.
- [x] 4.2 Run `pnpm typecheck`.
- [x] 4.3 Run `openspec validate --changes --strict`.
