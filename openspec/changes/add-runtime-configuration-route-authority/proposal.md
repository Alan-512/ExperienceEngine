## Why

Production learning must be bound to one immutable, validated configuration generation and one current effective route set. Existing settings files, configured provider/model names, environment overrides, or successful one-off calls are not sufficient authority. Phase 0.5A.1 freezes crash-atomic configuration publication, machine-integrity binding, capability-specific validation, runtime-route projection, invalidation, and profile-registry rules.

This fourth slice depends on package/home, schema/migration, and process authority. It still does not enable production queue work before the production activation handshake slice.

## What Changes

- Consume the create-once machine-integrity-key authority established by S1 and bind configuration/secret HMACs to its committed key id without adding a second key lifecycle.
- Add immutable configuration-generation manifests and secret-reference HMAC integrity without persisting secret values.
- Add provider and embedding validation records bound to home, package generation, configuration generation, capability, adapter, schema, route set, registry evidence, and secret refs.
- Add capability-specific route state, active/effective route set, monotonic projection revision, and atomic current-generation pointer CAS.
- Add environment-override and dependency-change invalidation rules.
- Add the minimum packaged quality-profile registry and compatibility/integrity rules.
- Keep production semantic writes fail-closed until S6 binds the exact configuration and route set into the current production handshake.

## Capabilities

### New Capabilities

- `runtime-configuration-route-authority`: Immutable configuration publication, integrity-bound secrets, provider/embedding validation, packaged profile registry, capability route state, and current effective-route authority.

### Modified Capabilities

- `experience-learning-quality`: Production learning quality becomes capability-specific and profile-bound; configured provider names or rule fallback cannot substitute for validated semantic routes or benchmark assurance.

## Impact

- Expected code areas: config schema/load/commit, secrets store, path normalization, provider/embedding validators, distillation adapters, route selection, runtime route repository, profile registry, init/doctor/status flows, and tests.
- Expected persisted concepts: machine key id, immutable generation manifest, validation record, capability route, effective route fingerprint, current-generation authority row, pointer revision, registry entry identity/integrity, and invalidation reason.
- Dependencies: S1-S3.
- Held closed until: S6 production activation binds current configuration and route authority.
- Existing public setup/support claims remain unchanged.
