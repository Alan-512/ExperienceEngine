## 1. Define Validation Scope

- [x] 1.1 Add an OpenSpec delta for real skip-boundary verification
- [x] 1.2 Define what persisted runtime evidence is sufficient to consider real skip behavior validated

## 2. Execute Real Runtime Validation

- [x] 2.1 Run a real follow-up task against the local OpenClaw runtime in a different task family from the existing experience node
- [x] 2.2 Verify the resulting record persists empty `injected_node_ids_json` and does not increment injected stats

## 3. Promote Regression Assets

- [x] 3.1 Sanitize and promote the real negative-control payload sequence into the fixture corpus
- [x] 3.2 Extend replay assertions so the negative-control fixture must remain a skip

## 4. Validate

- [x] 4.1 Run `npx @fission-ai/openspec@latest validate --changes --strict`
- [x] 4.2 Run `pnpm check`
