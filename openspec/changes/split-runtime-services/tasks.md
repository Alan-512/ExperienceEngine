## 1. Characterization Tests

- [x] 1.1 Add or identify runtime tests covering tool event recovery and dedupe
- [x] 1.2 Add or identify runtime tests covering finalize task record/outcome persistence
- [x] 1.3 Add or identify runtime tests covering learning trigger and background learning behavior
- [x] 1.4 Add or identify tests proving host adapters still call the same facade

## 2. Task Finalization Extraction

- [x] 2.1 Extract finalization dependencies into a `TaskFinalizationService` boundary
- [x] 2.2 Delegate `ExperienceRuntimeService.finalizeTask` to the new boundary
- [x] 2.3 Remove obsolete private helpers only after tests pass

## 3. Learning Pipeline Boundary

- [x] 3.1 Extract learning gate and distillation orchestration from the runtime facade
- [x] 3.2 Keep hybrid posttask behavior unchanged during extraction
- [x] 3.3 Verify rejected/accepted learning behavior stays unchanged in this structural change

## 4. Validation

- [x] 4.1 Run focused runtime and adapter tests
- [x] 4.2 Run `pnpm check`
- [x] 4.3 Run `openspec validate --changes --strict`
