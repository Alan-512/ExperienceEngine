## 1. Define Cleanup Scope

- [x] 1.1 Add an OpenSpec delta for canonical warning-variant cleanup
- [x] 1.2 Document the merge-and-retire cleanup behavior for legacy warning duplicates

## 2. Implement and Verify

- [x] 2.1 Add a maintenance script that merges historical warning variants into the canonical warning node
- [x] 2.2 Add regression coverage proving duplicate warning variants are retired while counters merge into the canonical node

## 3. Validate

- [x] 3.1 Run the maintenance script against the real OpenClaw SQLite state and verify the canonical warning remains active
- [x] 3.2 Run `pnpm check`
