## 1. Spec

- [x] 1.1 Add an OpenSpec delta for real Claude injection and feedback verification
- [x] 1.2 Define what persisted runtime evidence is sufficient for inject, skip, helped, and harmed on Claude

## 2. Real Runtime Validation

- [x] 2.1 Run a real similar Claude follow-up task and verify prompt-time injection plus persisted injected node ids
- [x] 2.2 Run a real Claude negative-control task and verify the adapter skips injection
- [x] 2.3 Run real Claude injected success/failure turns and verify node helped/harmed counters update

## 3. Fixtures And Regression

- [x] 3.1 Promote any useful sanitized real Claude payload sequence into repository fixtures
- [x] 3.2 Extend replay or unit coverage if the promoted fixture adds untested behavior

## 4. Validation

- [x] 4.1 Run `pnpm check`
- [x] 4.2 Run `npx @fission-ai/openspec@latest validate --changes --strict`
