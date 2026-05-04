## 1. Renderer Contract

- [ ] 1.1 Update `renderInjection` to accept optional `InterventionStrength`
- [ ] 1.2 Keep current rendering as fallback when strength is absent
- [ ] 1.3 Pass strength from controller decisions into renderer calls

## 2. Policy Templates

- [ ] 2.1 Add diagnostic hint title and usage instruction
- [ ] 2.2 Add soft recommendation title and usage instruction
- [ ] 2.3 Add strong recommendation title and usage instruction
- [ ] 2.4 Add hard constraint title and usage instruction
- [ ] 2.5 Preserve structured guidance expansion rules for mature nodes

## 3. Validation

- [ ] 3.1 Add renderer unit tests for all four strengths
- [ ] 3.2 Add regression tests for fallback rendering and compact conservative candidate output
- [ ] 3.3 Add controller/runtime tests proving rendered text receives the selected strength
- [ ] 3.4 Run `pnpm vitest run tests/unit/injection-renderer.test.ts tests/unit/intervention-controller.test.ts tests/unit/runtime-service.test.ts`
- [ ] 3.5 Run `pnpm typecheck`

