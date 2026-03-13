## 1. Shared MCP Entry

- [x] 1.1 Add a generic ExperienceEngine MCP server CLI entrypoint and keep the Codex-specific alias working

## 2. Claude Installer Wiring

- [x] 2.1 Add Claude MCP CLI command helpers for add/get/remove
- [x] 2.2 Extend `ee install claude-code` to register the ExperienceEngine MCP server with Claude Code
- [x] 2.3 Persist Claude MCP host-wiring details in install state

## 3. Claude Doctor

- [x] 3.1 Extend Claude doctor to verify MCP wiring in addition to hooks
- [x] 3.2 Add installer/doctor regression tests for Claude MCP wiring

## 4. Validation

- [x] 4.1 Run `pnpm check`
- [x] 4.2 Run `openspec validate --changes --strict`
