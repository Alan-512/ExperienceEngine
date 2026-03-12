## 1. Spec And Shared Version Plumbing

- [x] 1.1 Add OpenSpec requirements for adapter version recording, doctor drift detection, and host-specific upgrade entrypoints
- [x] 1.2 Add a shared package-version utility and conservative version comparison

## 2. Install-State And Doctor

- [x] 2.1 Persist the current package version into OpenClaw, Claude Code, and Codex install-state
- [x] 2.2 Extend install inspection and `ee doctor` output to surface recorded/current version drift

## 3. Upgrade Command

- [x] 3.1 Add `ee upgrade openclaw|claude-code|codex`
- [x] 3.2 Reuse host-specific install flows and print upgrade-oriented guidance

## 4. Validation

- [x] 4.1 Add or update installer/doctor/upgrade tests for all supported hosts
- [x] 4.2 Run `pnpm check` and `openspec validate --changes --strict`
