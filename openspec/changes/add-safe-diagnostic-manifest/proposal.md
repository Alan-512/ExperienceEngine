## Why

ExperienceEngine can currently explain setup and runtime state through local operator commands, but those commands are presentation surfaces and some verbose paths expose absolute locations. Existing state export intentionally copies SQLite/settings/install files. Neither is safe to attach to public issues.

Phase 0.5B requires a strict, content-free, review-first diagnostic manifest derived without bootstrapping or mutating runtime state.

## What Changes

- Add a versioned strict diagnostic manifest and collection policy.
- Add existing-file-only read-only database collection for integrity classification, allowlisted counts, time ranges, and stable error codes.
- Reuse the existing machine integrity key and `diagnostic-identity-v1` HMAC domain for bounded identity fingerprints without creating or rotating a key.
- Add `ee diagnose` for concise local output.
- Add `ee diagnose --prepare-bundle` to create a fresh review directory containing only the exact `manifest.json` values.
- Exclude raw databases, settings, tasks, prompts, source code, repo identity, paths, tool/provider payloads, credentials, and free-text errors.

## Capabilities

### New Capabilities

- `safe-diagnostic-manifest`: Strict privacy-safe diagnostic collection, validation, stable error aggregation, and review-directory preparation.

### Modified Capabilities

- `cli-user-experience-surface`: Add a read-only diagnose surface and review-bundle preparation without presenting it as automatic telemetry or upload.

## Impact

- Expected code areas: diagnostic contracts/collectors, runtime identity helpers, read-only SQLite inspection, CLI dispatch, docs, and tests.
- No runtime authority or semantic state mutation is permitted.
- D2 owns archive creation; D1 review directories are not yet a complete public feedback workflow.
- `support_claim_allowed=false` and `production_learning_ready=false` remain unchanged.
