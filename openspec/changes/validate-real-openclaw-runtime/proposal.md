## Why

The repository now has a plugin manifest, lifecycle registration, and fixture-backed replay tests, but it still lacks a disciplined path for validating against a real OpenClaw development runtime. Without a dedicated runtime-validation capability, payload assumptions can drift silently and future compatibility fixes will be reactive.

## What Changes

- Add a runtime-validation capability that formalizes how real OpenClaw payloads are captured, curated, and replayed in this repository.
- Define a canonical fixture corpus workflow so real payload samples can be normalized into stable test assets.
- Define a lightweight development harness requirement for exercising the plugin against a local OpenClaw runtime before broader feature work continues.

## Capabilities

### New Capabilities
- `openclaw-runtime-validation`: Development-time validation workflow for capturing real OpenClaw payloads, curating canonical fixtures, and replaying them against the ExperienceEngine plugin.

### Modified Capabilities
- None.

## Impact

- Affects OpenSpec governance under `openspec/changes/validate-real-openclaw-runtime/`
- Affects integration fixtures and replay tests under `tests/fixtures/openclaw/` and `tests/integration/`
- Will later affect plugin developer tooling and any local OpenClaw harness scripts added to the repository
