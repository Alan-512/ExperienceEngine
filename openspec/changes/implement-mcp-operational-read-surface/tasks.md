## 1. Shared Operational Read Service

- [x] 1.1 Add a shared service that returns structured doctor state for each adapter
- [x] 1.2 Add structured remote update-check results keyed by adapter

## 2. Codex MCP Operational Reads

- [x] 2.1 Expose `experienceengine://doctor/{adapter}`
- [x] 2.2 Expose `experienceengine://updates/latest/{adapter}`
- [x] 2.3 Add read-only tools `experienceengine_doctor` and `experienceengine_check_update`

## 3. Validation

- [x] 3.1 Add unit coverage for the shared operational read service
- [x] 3.2 Add Codex MCP server coverage for doctor/update resources and tools
- [x] 3.3 Run `pnpm check` and `openspec validate --changes --strict`
