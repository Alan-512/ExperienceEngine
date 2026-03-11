## 1. Define Validation Scope

- [x] 1.1 Add an OpenSpec delta for real second-turn injection verification
- [x] 1.2 Define what runtime evidence is sufficient to consider real conservative injection validated

## 2. Execute Real Runtime Validation

- [x] 2.1 Run a real follow-up task against the local OpenClaw runtime after a successful seed task exists
- [x] 2.2 Verify persisted records, injected node ids, and stats reflect real injection behavior

## 3. Promote Regression Assets

- [x] 3.1 Sanitize and promote at least one real runtime payload sequence into the fixture corpus when it adds host-shape coverage
- [x] 3.2 Extend replay assertions if the promoted fixture reveals a previously untested host shape

## 4. Validate

- [x] 4.1 Run `npx @fission-ai/openspec@latest validate --changes --strict`
- [x] 4.2 Run `pnpm check`
