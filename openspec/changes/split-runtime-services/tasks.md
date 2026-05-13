## 1. Characterization Tests

- [ ] 1.1 Add or identify runtime tests covering tool event recovery and dedupe
- [ ] 1.2 Add or identify runtime tests covering finalize task record/outcome persistence
- [ ] 1.3 Add or identify runtime tests covering learning trigger and background learning behavior
- [ ] 1.4 Add or identify tests proving host adapters still call the same facade

## 2. Task Finalization Extraction

- [ ] 2.1 Extract finalization dependencies into a `TaskFinalizationService` boundary
- [ ] 2.2 Delegate `ExperienceRuntimeService.finalizeTask` to the new boundary
- [ ] 2.3 Remove obsolete private helpers only after tests pass

## 3. Learning Pipeline Boundary

- [ ] 3.1 Extract learning gate and distillation orchestration from the runtime facade
- [ ] 3.2 Keep hybrid posttask behavior unchanged during extraction
- [ ] 3.3 Verify rejected/accepted learning behavior stays unchanged in this structural change

## 4. Validation

- [ ] 4.1 Run focused runtime and adapter tests
- [ ] 4.2 Run `pnpm check`
- [ ] 4.3 Run `openspec validate --changes --strict`
