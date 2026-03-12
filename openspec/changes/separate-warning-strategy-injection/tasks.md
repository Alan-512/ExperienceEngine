## 1. Define Validation Scope

- [x] 1.1 Add an OpenSpec delta for node-type-aware injection selection
- [x] 1.2 Define the strategy-first selection rule and warning fallback behavior

## 2. Implement and Verify Locally

- [x] 2.1 Update controller selection to prefer strategy nodes over warning nodes
- [x] 2.2 Extend regression tests so mixed node sets inject only strategies, while warning-only sets still inject

## 3. Verify in Real Runtime

- [ ] 3.1 Run a real injected turn in a scope containing both strategy and warning nodes
- [ ] 3.2 Verify the persisted `injected_node_ids_json` excludes warning nodes when strategy nodes are available

## 4. Validate

- [ ] 4.1 Run `npx @fission-ai/openspec@latest validate --changes --strict`
- [ ] 4.2 Run `pnpm check`
