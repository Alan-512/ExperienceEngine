## 1. Policy Evidence Read Model

- [ ] 1.1 Define structured repo policy inspection types for state, restore guidance, evidence summary, and evidence entries.
- [ ] 1.2 Add repository methods that return recent attribution evidence entries for a scope with node and injection references.
- [ ] 1.3 Add repository methods that return recent fallback injection evidence entries for a scope.
- [ ] 1.4 Add a pure evidence summarizer that merges attribution and fallback evidence, caps the window at 20, and counts verdicts/sources.
- [ ] 1.5 Add unit tests for evidence windowing, source labeling, verdict counts, and no-evidence behavior.

## 2. Interaction Surface

- [ ] 2.1 Add `inspectRepoPolicy` or equivalent structured method to `ExperienceInteractionService`.
- [ ] 2.2 Include policy state, bounded evidence summary, recent evidence entries, and restore guidance.
- [ ] 2.3 Ensure inspection is read-only and does not write repo policy, attribution, injection, review, or node records.
- [ ] 2.4 Extend repo summary to include the evidence-aware policy summary without changing existing summary fields.
- [ ] 2.5 Add interaction-service tests for clear policy, tripped policy, mixed attribution/fallback evidence, and read-only behavior.

## 3. CLI And Operator Output

- [ ] 3.1 Extend existing inspect/config CLI output to show repo policy state and evidence-aware circuit details.
- [ ] 3.2 Keep restore output explicit and aligned with `ee config restore repo-policy`.
- [ ] 3.3 Ensure CLI wording distinguishes automatic attribution from manual override evidence and fallback injection evidence.
- [ ] 3.4 Add inspect/config command tests for clear policy, tripped policy, evidence rows, and restore guidance.

## 4. Validation

- [ ] 4.1 Run `pnpm vitest run tests/unit/repo-policy.test.ts tests/unit/interaction-service.test.ts tests/unit/inspect-command.test.ts tests/unit/config-command.test.ts`.
- [ ] 4.2 Run `pnpm typecheck`.
- [ ] 4.3 Run `openspec validate --changes --strict`.

