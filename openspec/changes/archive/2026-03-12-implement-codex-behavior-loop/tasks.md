## 1. Spec

- [x] 1.1 Add an OpenSpec delta for the Codex MCP behavior loop
- [x] 1.2 Define the supported Codex MCP tool surface without assuming host lifecycle hooks

## 2. Runtime And MCP Tools

- [x] 2.1 Keep a shared runtime instance alive across Codex MCP tool calls
- [x] 2.2 Add a Codex MCP tool to record tool results through the shared runtime
- [x] 2.3 Add a Codex MCP tool to finalize tasks through the shared runtime

## 3. Validation

- [x] 3.1 Add regression coverage for Codex inject/helped/harmed behavior
- [x] 3.2 Run `pnpm check`
- [x] 3.3 Run `npx @fission-ai/openspec@latest validate --changes --strict`
