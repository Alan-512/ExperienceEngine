## 1. Contract Baseline

- [x] 1.1 Materialize the imported Section 4.7/4.8/4.13/4.15/4.17/4.18/4.20/6.6 initial table fields, keys, defaults, nullability, reference constraints, allowed bootstrap writers, fixed authority-table set, resolution order, key schema/domains, v1 layout constants, normalization cases, package identity, and closure-manifest fixture as typed contract data used by tests.
- [x] 1.2 Add tests capturing current package-entrypoint and ExperienceEngine-home behavior without claiming the target runtime exists.
- [x] 1.3 Define package closure, package generation, home identity, path-normalization version, and mismatch result types.

## 2. Package Runtime Closure

- [x] 2.1 Add a package-relative runtime-closure manifest for plugin, supervisor, worker, schema/migrations, profile registry, and compatibility metadata.
- [x] 2.2 Validate manifest integrity against source build and packed-artifact layouts.
- [x] 2.3 Reject declared-but-missing or digest-mismatched runtime assets.

## 3. Canonical Shared Home

- [x] 3.1 Centralize the versioned home-resolution order used by plugin, supervisor, worker, and operator paths.
- [x] 3.2 Derive and expose a stable home id, normalization version, resolution mode, and database-location fingerprint.
- [x] 3.3 Reject cross-participant home or package-generation mismatch before database authority acquisition.
- [x] 3.4 Prove supervisor and worker consume the gateway-resolved home envelope and cannot re-run environment/data-presence precedence.
- [x] 3.5 Add concurrent insert-if-absent bootstrap tests and exact Windows/UNC/NFC normalization fixtures.

## 4. Integrity Key And Fixed Control Bootstrap

- [x] 4.1 Implement atomic create-if-absent/adopt for `machine-secrets/integrity-key.json` after home resolution and before SQLite open/create.
- [x] 4.2 Enforce user-only permissions, key-id convergence, diagnostic/export/distribution exclusion, no-rotation v1, and exact HMAC domain separation.
- [x] 4.3 Implement the versioned idempotent fixed control-plane bootstrap transaction and complete `runtime_control_meta` binding.
- [x] 4.3a Generate and test the physically complete v1 authority-table DDL from frozen typed contract fixtures; prove S3–S6 require no opportunistic startup DDL.
- [x] 4.4 Restrict bootstrap writers to the package-local initializer, gateway service controller, or supervisor; prohibit ordinary hook-path DDL.
- [x] 4.5 Prove the fixed bootstrap cannot alter an existing control schema or any learning table and hands all later schema changes to S2.

## 5. Inspection And Compatibility

- [x] 4.1 Add concise inspection/doctor diagnostics for package closure and shared-home identity without implying activation.
- [x] 4.2 Preserve existing host and CLI behavior until later slices consume the new identity contract.

## 6. Validation

- [x] 5.1 Run focused package/home identity tests.
- [x] 5.2 Run TypeScript typecheck and relevant install/path tests.
- [x] 5.3 Run build and packed-artifact closure validation.
- [x] 5.4 Run `pnpm exec openspec validate establish-runtime-package-home-identity --strict`.
