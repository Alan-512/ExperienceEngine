## 1. Spec

- [x] 1.1 Add an OpenSpec delta for Codex MCP foundation
- [x] 1.2 Define the supported Codex install and doctor surface without assuming lifecycle hooks

## 2. Installer And Doctor

- [x] 2.1 Add a Codex installer path to `ee install codex`
- [x] 2.2 Add a Codex doctor path to `ee doctor codex`
- [x] 2.3 Persist Codex adapter install-state under the shared ExperienceEngine product home

## 3. MCP Foundation

- [x] 3.1 Add a `codex-mcp-server` CLI entrypoint owned by ExperienceEngine
- [x] 3.2 Expose a minimal MCP surface that Codex can register successfully

## 4. Validation

- [x] 4.1 Add regression coverage for Codex install/doctor/server foundation
- [x] 4.2 Run `pnpm check`
- [x] 4.3 Run `npx @fission-ai/openspec@latest validate --changes --strict`
