## 1. Shared Interaction Service

- [x] 1.1 Add a shared interaction service for inspect-style reads and low-risk feedback/scope control
- [x] 1.2 Refactor touched CLI commands to use the shared interaction service without changing user-facing output semantics

## 2. Codex MCP Resources

- [x] 2.1 Expose `experienceengine://last`
- [x] 2.2 Expose `experienceengine://recent/{mode}/{limit}`
- [x] 2.3 Expose `experienceengine://nodes/active`
- [x] 2.4 Expose `experienceengine://node/{id}`
- [x] 2.5 Expose `experienceengine://nodes/state/{state}` and `experienceengine://nodes/type/{type}`

## 3. Codex MCP Low-Risk Tools

- [x] 3.1 Add `experienceengine_feedback_last`
- [x] 3.2 Add `experienceengine_feedback_node`
- [x] 3.3 Add `experienceengine_disable_scope`
- [x] 3.4 Add `experienceengine_enable_scope`

## 4. Validation

- [x] 4.1 Add unit coverage for the shared interaction service
- [x] 4.2 Add Codex MCP server coverage for the new resources and low-risk tools
- [x] 4.3 Run `pnpm check` and `openspec validate --changes --strict`
