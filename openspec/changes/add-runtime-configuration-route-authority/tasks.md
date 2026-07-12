## 1. Integrity And Generation Schema

- [ ] 1.1 Materialize imported profile-registry, configuration-generation, validation-record, capability-route, route-envelope, runtime-projection, invalidation, and fallback tables as typed exhaustive fixtures/constants.
- [ ] 1.2 Load and verify the S1 machine-integrity-key authority before configuration work; add tests proving S4 cannot create, rotate, replace, repair, or re-sign the key.
- [ ] 1.3 Add immutable configuration-generation manifest, current authority row, pointer revision, and secret-reference integrity schema/repositories.
- [ ] 1.4 Add crash/replay/stale-base tests for the generation pointer CAS.

## 2. Profile Registry And Validation

- [ ] 2.1 Add the minimum packaged profile registry with version, integrity, compatibility, supersession, deprecation, and revocation metadata.
- [ ] 2.2 Add capability-specific provider, learning-gate, distillation, embedding, and optional hybrid validation records.
- [ ] 2.3 Bind records to home, package, configuration, adapter, schemas, route set, registry evidence, and HMAC secret references.

## 3. Runtime Route Authority

- [ ] 3.1 Add capability route and effective route-set schema with one writer and monotonic projection revision.
- [ ] 3.2 Implement atomic projection replacement and fail-closed recovery after partial/crashed updates.
- [ ] 3.3 Include supported environment overrides in the effective route fingerprint.
- [ ] 3.4 Implement exact invalidation for changed config, secrets, package, schema, adapter, registry, route, or environment bindings.
- [ ] 3.5 Make the package-local supervisor the sole runtime-route projection writer; keep plugin read-only and route worker observations through fenced IPC.
- [ ] 3.6 Make the supervisor the sole runtime effective-route resolver and pass one immutable normalized route envelope to the worker.
- [ ] 3.7 Add fail-closed tests for missing, malformed, partial, stale-fence, and authority-mismatched route projections.
- [ ] 3.8 Consume S6 `production_write_authorized(mutable_route_projection)` for mutable production health projection and prove pre-S6 writes remain blocked/unknown rather than healthy.

## 4. Product Boundaries

- [ ] 4.1 Preserve capability-specific setup, validation, assurance, and runtime-health projections.
- [ ] 4.2 Preserve `custom-shadow-only-v1` regardless of validation or profile labels.
- [ ] 4.3 Keep production queue work disabled pending S6 handshake authority.
- [ ] 4.4 Supersede production learning-quality behavior so missing provider routes block semantic generation rather than invoking rule-authored candidate or passthrough node fallback.
- [ ] 4.5 Add explicit legacy-rule-mode compatibility tests proving it is opt-in, separately labeled, and never selected silently by provider failure.

## 5. Validation

- [ ] 5.1 Run focused integrity, config-generation, provider/embedding validation, route, and registry tests.
- [ ] 5.2 Run TypeScript typecheck and affected init/config/runtime tests.
- [ ] 5.3 Run the full suite and build after shared config/storage changes.
- [ ] 5.4 Run `pnpm exec openspec validate add-runtime-configuration-route-authority --strict`.
