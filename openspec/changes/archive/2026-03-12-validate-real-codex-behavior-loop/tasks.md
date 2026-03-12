## 1. Spec

- [x] 1.1 Add an OpenSpec delta for real Codex behavior validation
- [x] 1.2 Define the persisted runtime evidence required for real Codex MCP-loop validation

## 2. Real Runtime Validation

- [x] 2.1 Install the Codex adapter against a temporary ExperienceEngine home for live validation
- [x] 2.2 Run a real Codex MCP sequence that looks up hints, records a tool result, and finalizes the task
- [x] 2.3 Verify persisted injected node ids and helped/harmed feedback from the real run

## 3. Validation

- [x] 3.1 Run `pnpm check`
- [x] 3.2 Run `npx @fission-ai/openspec@latest validate --changes --strict`
