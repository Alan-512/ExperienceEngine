## 1. Define Canonical Warning Scope

- [x] 1.1 Add an OpenSpec delta for canonical warning node keys
- [x] 1.2 Document which warning metadata remains tool-specific and which part becomes canonical

## 2. Implement and Verify

- [x] 2.1 Update warning candidate extraction so `compact_hint` is stable across failure sources
- [x] 2.2 Add regression coverage proving repeated warning candidates converge on one node id

## 3. Validate

- [x] 3.1 Run `npx @fission-ai/openspec@latest validate --changes --strict`
- [x] 3.2 Run `pnpm check`
