## 1. Define Validation Scope

- [ ] 1.1 Add an OpenSpec delta for real feedback-attribution verification
- [ ] 1.2 Define what persisted node evidence is sufficient to consider helped/harmed attribution validated

## 2. Execute Real Runtime Validation

- [ ] 2.1 Verify a real injected success turn increments node usage/helped counters
- [ ] 2.2 Run a real injected failure turn and verify node usage/harmed counters increment

## 3. Validate

- [ ] 3.1 Run `npx @fission-ai/openspec@latest validate --changes --strict`
- [ ] 3.2 Run `pnpm check`
