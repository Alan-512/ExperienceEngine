# ExperienceEngine — Unreleased

`v0.5.2` is published and immutable on npm and GitHub Releases. Its exact npm artifact passed the complete OpenClaw `2026.7.1` live-host sequence and a fresh three-scenario C3 campaign. A later public ClawHub `0.5.2` upload is invalid because it contains an incomplete source-only artifact without the built runtime. `v0.5.3` repairs that channel boundary, aligns the Claude marketplace installer with the package version, and strengthens install/privacy disclosures plus candidate completeness checks.

## v0.5.3 three-channel repair

- Aligns root package, OpenClaw manifest, Claude plugin manifests, Claude marketplace installer cache/state, and tests on one exact release version.
- Rejects npm or ClawHub release candidates that omit mandatory built runtime entries; the reduced ClawHub artifact must also contain its bundled MCP SDK and Zod dependencies.
- Adds explicit install-time warnings for persistent user-level agent configuration, broad lifecycle hook coverage, opt-in raw payload sensitivity, and remote-provider data transfer.
- Corrects public documentation to distinguish the invalid ClawHub `0.5.2` upload from the previously accepted reduced candidate.

## Privacy-safe diagnostics and public feedback

- Adds read-only `ee diagnose` over a strict allowlisted manifest without initializing a missing home, key, database, or runtime authority.
- Adds review-first `ee diagnose --prepare-bundle`, producing exactly one local `manifest.json`.
- Adds explicit `ee diagnose --archive <review-directory>`, strict revalidation, deterministic one-file `.tar.gz`, atomic no-overwrite output, SHA-256, and byte-size reporting.
- Excludes raw SQLite/settings, prompts, source, paths, credentials, tool/provider payloads, endpoint URLs, and free-text errors by default.
- Adds installation, runtime bug, harmful intervention, and feature request templates plus contribution and private security-reporting guidance.
- Does not add remote telemetry, automatic upload, or automatic issue submission.

## v0.5.1 ClawHub packaging repair

- Builds ClawHub from the existing reduced OpenClaw runtime-closure stage rather than reusing the full npm tarball.
- Installs required production dependencies in a clean npm stage with scripts, dev dependencies, peers, audit/funding calls, and binary links disabled.
- Packs required dependencies as ordinary `bundledDependencies` files and rejects links before and after archive creation.
- Revalidates the unpacked archive's generated closure, declared relative imports, and required external runtime imports.
- Keeps the documented local-embedding backend as an explicit optional runtime dependency instead of adding its heavy model runtime to default installs.
- Adds a generic dual-channel release-candidate builder that records exact artifact and source identities without publishing.

## OpenClaw runtime closure remediation

- Made the embedded runtime closure manifest the sole production-runtime packaging authority.
- Removed publication validators and download tooling from the OpenClaw production closure unless imported by a production entrypoint.
- Added staging and final-tarball closure validation plus undeclared relative-import rejection.
- Added immutable HMAC-signed install attestations with explicit `local_pack`, `host_native_unattested`, `published_npm_attested`, and `published_clawhub_attested` origins.
- Made OpenClaw install, repair, update, interrupted update, and rollback transactional.
- Replaced implicit unsafe installation with an explicit approval flow and stable normalized security-scan digests.
- Split installed-artifact smoke from real OpenClaw live-host evidence.
- Added a real-host runner covering exact plugin installation, isolated Gateway authentication, plugin service registration, a real agent turn, protected queue completion, stale-output rejection, Gateway restart recovery, and terminal shutdown evidence.
- Cold package activation no longer initializes implicitly during Gateway service start. The real-host gate now executes the authorized prepare and initialize plugin commands through OpenClaw's user-message command path, proves preparation is read-only, uses the exact returned revisions and ids, and verifies idempotent replay.
- Added bounded Windows OpenClaw `.exe`/`.cmd`/`.bat` resolution and safe batch-shim invocation.
- Added native Windows direct Gateway health/command transport and an stdin-to-`SIGINT` lifecycle bridge so foreground OpenClaw Gateway shutdown reaches plugin-service drain and terminal authority evidence instead of Windows force termination.
- Added OpenClaw `2026.7.1` compatibility for independently loaded startup plugin and command registries by sharing one deferred package-local runtime, waiting for the real service projection, and migrating legacy agent credentials into the isolated host SQLite auth store only when required.
- Added read-only exact-revision activation preparation, persisted runtime-health evidence, stable first-line lifecycle error codes, and strict `ee verify openclaw-production` semantics.
- Made cold package activation require the exact prepared package generation, both revisions, control request id, and authorization id; missing, changed, stale, or cross-generation required input now fails closed.
- Isolated integrity-key ACL inspection and enforcement from inherited PowerShell 7 module paths so `powershell.exe` 5.1 always loads its compatible system security module.
- Separated `artifact_runtime_validated` from `support_claim_allowed`.
- Corrected README and user-guide wording so plugin load and routine interaction are not presented as full production-learning readiness.

## Validation status

- Source/runtime closure: passed.
- Local package production activation and fenced semantic queue: passed.
- Local-pack real OpenClaw `2026.4.1` host preflight: passed independently on Linux x64 under WSL and native Windows x64 with explicit host-security approval.
- Latest-stable WSL compatibility: OpenClaw `2026.7.1` with Node `24.18.0` passed the full local-pack real-host path, including a real model turn, production semantic completion, stale-authority rejection, restart recovery, and graceful shutdown evidence.
- Published npm `0.4.8`: correctly rejected at closure step 1 because the old artifact lacks the embedded manifest.
- Published ClawHub `0.4.8`: correctly rejected independently at closure step 1.
- Published npm `0.5.0`: exact registry bytes, installed closure binding, and the complete OpenClaw `2026.7.1` live-host gate passed.
- Published ClawHub `0.5.0`: exact clean artifact bytes and closure passed; native install failed because OpenClaw installed the package without its declared runtime dependencies.
- Published npm and ClawHub `0.5.1`: exact artifact validation passed.
- Repeated matched-block v4: five complete single-scenario blocks passed the sealed campaign thresholds, with one-cluster limitations disclosed; general support/readiness claims remain disabled.
- `v0.5.2` diagnostics: source and clean local-pack functional validation passed; the exact published npm package then passed clean-home diagnose, exact review preparation, deterministic one-manifest archive, privacy, rejection, and no-upload acceptance.
- `v0.5.2` multi-scenario evidence: the published-npm v5 campaign completed all nine arms and independently proved correct skip, zero false-positive delivery, deterministic harmful exposure, production feedback/quarantine, and fresh-session recovery. The directional campaign remains `not_publishable` and does not change support/readiness flags.

See `docs/openclaw-runtime-support-matrix.md` for the exact evidence boundaries.
