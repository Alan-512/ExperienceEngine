## 1. Contract And Collector Foundation

- [x] 1.1 Add exhaustive v1 manifest, privacy, error, count, time-range, and consent types.
- [x] 1.2 Add strict validation that rejects unknown fields and unsafe consent combinations.
- [x] 1.3 Add an existing-file-only read-only SQLite inspection path with no bootstrap or DDL.
- [x] 1.4 Add allowlisted environment, product, host, runtime, database, count, and time-range collectors.
- [x] 1.5 Add stable-code-only error aggregation and bounded identifier projection.
- [x] 1.6 Add diagnostic HMAC prefixes using the existing key/domain without key creation.

## 2. CLI And Review Directory

- [x] 2.1 Add concise `ee diagnose` rendering from the strict manifest.
- [x] 2.2 Add `ee diagnose --prepare-bundle` with fresh-directory/no-overwrite semantics.
- [x] 2.3 Add explicit exact-model-id consent while keeping it excluded by default.
- [x] 2.4 Ensure the review directory contains exactly `manifest.json`.

## 3. Validation

- [x] 3.1 Add no-home/no-key/no-database non-mutation fixtures.
- [x] 3.2 Add populated-database allowlist and stable-error aggregation fixtures.
- [x] 3.3 Add privacy scans proving paths, repo identity, raw content, secrets, provider payloads, and free-text errors are absent.
- [x] 3.4 Add CLI routing and review-directory collision tests.
- [x] 3.5 Run focused tests, TypeScript, full tests, build, and strict OpenSpec validation.

## Acceptance Evidence

- `src/diagnostics` owns the strict v1 contract, conservative install-state-only host projection, existing-file-only read-only SQLite collector, stable-code aggregation, HMAC identity prefix, local summary, and exact one-file review directory.
- The collector never calls ordinary `openDatabase`, bootstrap, migration, repair, state export, or mutating host inspectors. A real empty-home smoke initially exposed Codex inspection mutation; that path was removed and retained as a regression boundary.
- Focused D1 tests passed `4` files / `16` tests, including strict unknown-field rejection, exact-model consent, empty-home non-mutation, populated-database privacy scans, stable error allowlisting, linked output-root rejection, collision refusal, and CLI routing.
- Full repository validation passed `235` test files / `1463` tests, TypeScript, and production build.
- Source and built `dist/cli` empty-home smoke both proved `HOME_CREATED=False`; explicit preparation created exactly `manifest.json` and the local root did not appear in the manifest.
- Runtime closure remained `3c7aab519faa57d38000090d6c5b5506b3ae8e0a231d2e38e5f17717dac1096f` with package build id `build_16df7fdd54be7801c2430c49a4fef2612144e559da5e2cb92bc99d319f559077`.
- OpenClaw package-local production binding passed unchanged and continued to report `production_learning_ready=false`.
- D1 strict OpenSpec and `git diff --check` passed. Archive creation remains deliberately unavailable until D2.
