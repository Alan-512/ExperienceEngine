## Context

The frozen protocol separates setup state, validation, benchmark assurance, runtime health, and value. Configuration must be assembled and validated in memory, committed as one immutable generation, and published through one crash-atomic authority-pointer CAS. Capability routes and their runtime projection have one writer and monotonic revision.

## Normative Frozen Contract Import

This change imports `phase-0.5a.1-freeze-2026-07-11` Sections 5.1–5.6, 6.1–6.7, and 7.1–7.3.

The implementation SHALL mechanically encode and test:

- quality profiles `evaluated_recommended | custom` and the complete packaged profile-registry schema/rules;
- capability-specific validation, benchmark assurance, runtime health, and required-for-production fields;
- immutable configuration-generation manifest, authority pointer, captured override snapshot, path-normalization binding, and HMAC secret-reference integrity using the S1 key with no second key lifecycle;
- provider/embedding validation record schema and all exact invalidation bindings;
- normalized route envelope, capability route/fallback matrix, effective-route-set identity, and environment override precedence;
- runtime route projection schema and writer matrix: package-local supervisor only, plugin read-only, worker observations submitted through fenced package-local control IPC;
- missing/malformed/authority-mismatched projection behavior that can never report healthy;
- custom profile acknowledgment, semantic-origin inputs consumed by S5, and the `custom-shadow-only-v1` cap.

## Goals / Non-Goals

**Goals:**

- Publish only complete immutable configuration generations.
- Bind secret references without storing secret values in manifests or diagnostics.
- Validate each capability's actual adapter/route contract.
- Maintain one current effective route set with deterministic invalidation.
- Ship a versioned, compatible, integrity-checked minimum profile registry.

**Non-Goals:**

- Replacing runtime queue failure semantics.
- Automatically escalating candidate failures into route failures.
- Enabling custom-origin live delivery.
- Completing package activation.
- Changing public docs before published-artifact validation.

## Decisions

### 1. Consume the S1 machine integrity key

S4 loads and verifies the key authority established by S1. It requires the observed key id to equal `runtime_control_meta.integrity_key_id`, uses the frozen HMAC domains for configuration/secret integrity, and never creates, rotates, replaces, repairs, or re-signs the key.

### 2. Commit immutable generations through one pointer CAS

Candidate settings, route choices, validation results, registry references, and secret-reference integrity are prepared off-authority. One SQLite transaction inserts the immutable generation and advances the current authority row/pointer from the exact retained base revision.

### 3. Validate by capability and actual route

Validation records identify capability, provider adapter, model/route, package generation, configuration generation, effective route set, schema versions, registry evidence, and secret references. A global configured-provider label cannot substitute for capability evidence.

### 4. Give runtime-route projection one writer

The route projection is replaced atomically, advances a monotonic revision, and is bound to current process/config authority. Partial route updates or unbound environment overrides fail closed.

The package-local supervisor is the sole persistent runtime-route projection writer. The plugin reads only. The worker submits capability-health observations through authenticated package-local control IPC using its current fence and cannot write the projection directly.

The supervisor is also the runtime authority for resolving the committed configuration plus captured allowlisted override snapshot into one immutable normalized route envelope. The worker must not reinterpret environment precedence, provider/model identity, endpoint policy, auth mode, fallback order, or contract selection.

Mutable runtime-route projection writes that publish current production health are protected writes. The supervisor must consume the S6 canonical `production_write_authorized(mutable_route_projection)` decision together with the exact current worker observation/fence. Before S6 exists, S4 may commit immutable configuration generations, validation evidence, and route envelopes, but runtime projection mutation remains fail-closed and health cannot become `healthy`.

### 5. Make invalidation deterministic

Configuration, secrets, package, schema, adapter, registry, route, or effective environment changes invalidate only the records whose bindings no longer match. Stale validation cannot be relabeled as current.

### 6. Keep custom-origin assurance conservative

This slice may establish provenance and registry inputs, but `custom-shadow-only-v1` remains a hard cap. No model self-claim, validation success, route choice, or profile label can grant live delivery.

## Risks / Trade-offs

- [Risk] Multi-file config can partially update. → Mitigation: immutable generation plus one authority-pointer CAS.
- [Risk] Secret fingerprints can leak or become unstable. → Mitigation: HMAC secret references with a home-bound key and allowlisted diagnostics.
- [Risk] Environment overrides can silently change routes. → Mitigation: include effective overrides in the route fingerprint and invalidate mismatched validation/handshake records.
- [Risk] Registry identity can drift across packages. → Mitigation: bind registry version, entry digest, package generation, compatibility, supersession, deprecation, and revocation.

## Acceptance Gate

- Tests cover key bootstrap order, immutable generation commit, crash/replay behavior, stale pointer rejection, validation bindings, route projection revision, override invalidation, registry integrity, and custom-origin cap preservation.
- Valid configuration/route state alone does not enable production queue work.
- `pnpm exec openspec validate add-runtime-configuration-route-authority --strict` passes.
