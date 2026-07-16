## Context

The frozen Phase 0.5B design requires review-first diagnostics. Current status/doctor/inspect output cannot be serialized safely, and the managed export service intentionally includes raw state. A new collector must operate over structured data and fail closed.

## Decisions

### Strict manifest, not captured CLI text

The collector emits one versioned object with no unknown fields. CLI rendering is downstream of that object.

### Existing-file-only read-only SQLite

The collector opens SQLite only when the configured file exists, with `readOnly: true`. It does not call `openDatabase`, `bootstrapDatabase`, migration, or repair code.

### Existing machine key only

Bounded identity fingerprints use `hmacMachineIntegrityInput(..., "diagnostic-identity-v1", ...)`. Missing/invalid keys omit optional fingerprints and emit a stable warning; collection never creates or rotates a key.

### Stable-code aggregation only

Known code/state columns are aggregated through allowlisted queries. Free-text error columns are never selected.

### One-file review directory

Preparation creates a fresh directory containing only `manifest.json`. Archive behavior belongs to D2.

## Non-Goals

- no remote telemetry or upload
- no raw database/log/settings export
- no trace snapshot inclusion
- no archive implementation in D1
- no mutation of runtime authority or semantic state
- no general support/readiness claim
