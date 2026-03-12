## 1. Define Metadata Refresh Scope

- [x] 1.1 Add an OpenSpec delta for refreshing candidate-derived node metadata on upsert
- [x] 1.2 Document which node fields refresh and which feedback fields remain preserved

## 2. Implement and Verify

- [x] 2.1 Update SQLite node upsert behavior to refresh candidate-derived metadata on conflict
- [x] 2.2 Add regression coverage proving a refreshed node keeps counters while adopting a cleaned `trigger_pattern`

## 3. Validate

- [ ] 3.1 Run `npx @fission-ai/openspec@latest validate --changes --strict`
- [ ] 3.2 Run `pnpm check`
