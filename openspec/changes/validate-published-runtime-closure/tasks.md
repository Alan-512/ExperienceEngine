## 1. Artifact Closure Harness

- [x] 1.1 Materialize the imported embedded closure, external attestation, validation-step, Windows resolution, and evidence-classification schemas as typed exhaustive fixtures/constants.
- [x] 1.2 Add isolated download/install helpers for exact npm and ClawHub artifact versions.
- [x] 1.3 Derive observed closure and compare entrypoints, dependencies, schemas, migrations, profiles, compatibility metadata, and integrity with S1 manifests.
- [x] 1.4 Reject declared-but-omitted, unresolved, integrity-mismatched, or source-repo-dependent artifacts.

### Artifact Closure Harness Evidence

- The embedded manifest field list, external distribution attestation, exact eight-step validation order, Windows fallback resolution record, live activation/queue/shutdown evidence, evidence tiers, and documentation matrix are frozen as typed constants and strict validators.
- npm materialization downloads exact registry metadata and artifact bytes directly, validates SRI, and writes only into an isolated destination. ClawHub materialization uses a channel-specific adapter but shares exact version/integrity enforcement; one channel cannot satisfy the other.
- Installed dependency closure is derived recursively from the isolated package root without persisting source paths. Observed closure reuses the S1 validator and additionally binds artifact size/integrity, registry identity, channel, profile, compatibility, dependency closure, and embedded closure digest.
- The embedded compatibility digest now truthfully records `source_local_pack_implemented_published_pending`; it does not declare npm or ClawHub support.

## 2. Clean-Home Runtime Validation

- [ ] 2.1 Run each artifact without an existing EE home and without a global `ee` command prerequisite.
- [ ] 2.2 Validate canonical home resolution, schema bootstrap/migration ownership, configuration generation, supervisor/worker authority, and production handshake.
- [ ] 2.3 Submit deterministic learning work and verify authoritative claim/completion evidence.
- [ ] 2.4 Validate authority invalidation, interruption recovery, gateway stop, drain, and shutdown.
- [ ] 2.5 Prove canonical activation uses only the plugin service lifecycle and package-local entrypoints without resolving or executing a global `openclaw` command.

### Source/Local-Pack Clean-Home Preflight Evidence

- The package-local production worker now recovers the current verified S4 configuration generation and route authority, maps only explicit supported provider adapters, and fails closed for unknown provider families without legacy-rule fallback.
- Production semantic execution claims, renews, completes, fails, and recovers interruption only through the S5 fenced learning queue. Provider/model/embedding work runs outside SQLite authority transactions; semantic node/provenance/candidate/job completion remains one fenced atomic commit.
- `pnpm runtime:validate-openclaw-binding` now uses a deterministic local provider fixture and a clean temporary home to prove one production claim/completion, then changes configuration authority while a second provider request is in flight and proves stale output rejection, interruption recovery, and zero content-retry consumption.
- This is source/local-pack preflight evidence only. Tasks 2.1–2.5 remain unchecked until the exact npm and ClawHub artifacts independently pass the frozen clean-home sequence; `production_learning_ready` remains false in the local-pack evidence.

### Actual Published npm 0.4.8 Attempt

- The exact `@alan512/experienceengine@0.4.8` npm registry artifact was downloaded from registry metadata, verified against registry SRI, and installed with lifecycle scripts disabled into an isolated package root with isolated npm cache/config and no inherited `NODE_PATH`.
- The downloaded artifact identity was exact: artifact size `701644`, integrity `sha512-VVxIDoIHOa7ZZcNCeI2j1NHZufxidongV4iSKaobLgRKJPCia2JRyzavxU1mOFEvMeM2eBroxhrqhO4josiRWw==`, and registry record identity `npm:@alan512/experienceengine@0.4.8:f822029a477de42e31643cc1088152bdd86195d4da113870ca5b6db352692854`.
- Validation failed at ordered step 1 with `EE_PUBLISHED_CLOSURE_SCHEMA_INVALID` and stable issue `read_embedded_manifest:ENOENT`: the published `0.4.8` artifact predates S1–S7 and does not contain `dist/runtime/package/runtime-closure-manifest.json`.
- Ordered steps 2–8 remain blocked, `support_claim_allowed` is false, and this failed attempt does not complete Tasks 2.1–2.5 or 5.2. A new exact published version containing the frozen closure is required before npm clean-home runtime validation can continue.

### Actual Published ClawHub 0.4.8 Attempt

- The ClawHub package artifact resolver and exact download endpoint were queried independently from npm. Artifact metadata, response headers, and downloaded bytes were cross-checked with SHA-256, npm SHA-512 SRI, SHA-1, size, exact name/version, and a ClawHub-specific registry record identity before isolated installation.
- The exact ClawHub artifact remained the reduced npm-pack: artifact size `53137`, integrity `sha512-iJrAWE7A1AdHqBU4fxYE7gI2PmMAkwMr32TJrQb3li8tccohNNHP3d+fB24Gv+pRDdatty0Y1UldnCeTwx7byw==`, SHA-256 `6baf066b177adc33e0bba1a6d6bd2cdab3b4e563f4fff18ab1c9a31b36325c90`, and registry record identity `clawhub:@alan512/experienceengine@0.4.8:071324ae59b1dac51b05e0b8ccd6137696e911ff67c26d77ef9c335f1de0b4bb`.
- Validation failed independently at ordered step 1 with `EE_PUBLISHED_CLOSURE_SCHEMA_INVALID` and stable issue `read_embedded_manifest:ENOENT`; the reduced ClawHub artifact does not contain the embedded runtime closure manifest or S1–S7 package-local runtime closure.
- Ordered steps 2–8 remain blocked, `support_claim_allowed` is false, and this failed attempt does not complete Tasks 2.1–2.5 or 5.3. npm and ClawHub failure evidence remains separately channel-bound and non-interchangeable.

## 3. Platform And Upgrade Coverage

- [x] 3.1 Implement bounded Windows OpenClaw executable resolution and version probing for supported doctor/repair fallback command forms.
- [x] 3.2 Add clean install, same-version repair, upgrade, interrupted upgrade, and rollback artifact scenarios required by the frozen contract.
- [x] 3.3 Record exact package, host, platform, home, activation, and artifact evidence for each completed run.
- [x] 3.4 Limit Windows executable resolution to doctor/repair fallback and add safe `.cmd`/`.bat` quoting tests that forbid broad shell concatenation.

## 4. Documentation Reconciliation

- [x] 4.1 Correct already-overstated README, README.zh-CN, and user-guide wording immediately while keeping any future supported-claim upgrade gated on published evidence.
- [x] 4.2 Correct ClawHub/npm install, upgrade, PATH, background-learning, provider, and status claims to match validated reality.
- [x] 4.3 Add unreleased notes and a support/evidence matrix distinguishing source, packed, installed-artifact, published, and live-host validation.
- [x] 4.4 Update installer/doctor state so npm, ClawHub, package-local activation, global CLI fallback, host security approval, and Windows doctor/repair command availability remain separate evidence dimensions.
- [x] 4.5 Add OpenClaw regressions proving plugin load alone, installed-artifact smoke, and incomplete artifact closure never report full-learning support.

## 5. Validation

- [x] 5.1 Run local packed-artifact closure tests as a preflight, not as final published evidence.
- [ ] 5.2 Run actual published npm validation.
- [ ] 5.3 Run actual published ClawHub validation.
- [x] 5.4 Run required live OpenClaw and Windows validation paths.
- [x] 5.5 Run TypeScript typecheck, full tests, build, and packaging checks.
- [x] 5.6 Run `pnpm exec openspec validate validate-published-runtime-closure --strict`.

### Final v0.5.0 Prepublication Candidate Evidence

> Superseded release-byte note, `2026-07-15`: the tarball recorded in this section remains historical prepublication evidence for the then-current tree. Subsequent documentation and remediation changes altered the package contents, so the recorded `1129301`-byte artifact must not be published. A new exact candidate must be rebuilt from the final committed release boundary and this evidence section must be updated before publication.

> Remediation validation update, `2026-07-15`: strict activation payload validation and Windows PowerShell module-environment isolation are implemented. With the parent `PSModulePath` set to the PowerShell 7 module directory, typecheck, 228 test files / 1422 tests, build, runtime closure validation, production binding, and strict OpenSpec validation passed. The final working-tree npm dry-run reports 1135 files, projected size `1133518`, unpacked size `5927923`, SHA-1 `cf2393d71a7d7076c89c6878c86ffc0c04810451`, and npm integrity `sha512-dSlwb5Z9eaZFzojqza+LsUdjYWYwN5yEzXOv/N2KtZ7M8IXfWYsFvsGmQ1Od4esLVnt8U4Tl/nVAnYltjeJSGg==`. This remains non-candidate evidence until the release boundary is committed and a new exact tarball is built.

### Remediated Exact v0.5.0 Candidate Evidence

- The release-source boundary is commit `4a0bced` (`docs: bind v0.5.0 publication to exact artifact evidence`), following remediation commit `4cd26bd` (`fix: close v0.5.0 release blockers`).
- The exact rebuilt candidate is `.tmp/release-candidate-v0.5.0-4a0bced/alan512-experienceengine-0.5.0.tgz`: `1133532` bytes, `1135` package entries, SHA-256 `07a93076c1ab196ffd790bb8c53885899ee33aca8415e4d5ed3242d082abac00`, npm SHA-1 `8371abd06ba88cf79f11d55883d5c7f6e4aafc2c`, and npm integrity `sha512-rYEf7KxkCbx270hvkBIIUcD5Eqq6BrTDptoMrH2p1SsdfLiuANbSHtHZIHpUV5QO07upibOJ+hOzxCn41/wiWg==`.
- Its embedded runtime closure digest is `06bad602d9d06909035aa2cc6052d3daca06cf22c76d5d53c47b5d34ef933f63` and package build id is `build_ec2989078b49518ffb80668e1d65733a4d92868211ce49cb89ac03f98f446339`.
- Packaged-document SHA-256 values match the committed source bytes exactly: `README.md` `537beeb69743aeacedd3771b3947678c0eed55e0608d74ce70d0580447d75dc2`; `README.zh-CN.md` `16d061afd48e7b3fff34c1442a455828e8deb04fbab383eebae530857f41d79a`; `docs/user-guide.md` `56b1fb0e11e0fc0ce6daae98958f83c82b1ac696a28bf8a26437fef77e98a551`; `docs/openclaw-runtime-support-matrix.md` `db35402b3aea4cb1a3d6906572a346c22a6940d1b59ef6b2a3d88b24309099f1`; `docs/releases/v0.5.0.md` `145d26cf63a74645b13055bc209fcfe15f341f33143d942c5f4341d454afda37`; `openclaw.plugin.json` `297f9f01f57b48f38d99b068cc2bfa41b758de2e3389bd8765faeb2ae9ae104e`; runtime closure manifest file `627b2c46652d040316919c2155dfde8bf48d16f1263e728f4e554e2c38852647`.
- An isolated install of this exact tarball completed with lifecycle scripts disabled and an isolated npm cache. The installed OpenClaw plugin, package-local supervisor, and package-local worker entrypoints all imported successfully without inherited `NODE_PATH`.
- This remains local prepublication evidence only. Tasks 2.1-2.5, 5.2, and 5.3 remain unchecked; exact published npm and ClawHub artifacts must be downloaded and validated independently, and `support_claim_allowed` remains false.

- The exact local candidate is `.tmp/release-candidate-v0.5.0/alan512-experienceengine-0.5.0.tgz`: `1129301` bytes, `1135` package entries, SHA-256 `22ce4eb250c95b1393e4a907a8358ded981119007ad6fc88cc4df0f7eafdeda0`, npm SHA-1 `992d664df97408a5d179b719fa35e98f0356174b`, and npm integrity `sha512-X+wnbZRPHaP5gLlk7H/XhGUCVkmDWV6t9PB9Mb8NRaGrmGlqWP18JqaEBOBGUWmxi/bL+NaUbosng70JGcjDrQ==`.
- Its embedded runtime closure digest is `cb48c7ab7195aac7c01d5bf09157f4655d64898acc13ae370d6e34ced33765d5` and package build id is `build_12d88716bde4f6551865c99631fb54c9ab54f995166dac1301994fe455023006`.
- An isolated install of this exact tarball completed with lifecycle scripts disabled and all three package-local production entrypoint imports (plugin, supervisor, and worker) passed closure validation.
- ClawHub CLI `0.23.1` validated the extracted exact candidate with `0` breakages, warnings, deprecations, or issues. A no-upload `package publish --dry-run` against the same tarball resolved `@alan512/experienceengine@0.5.0` as a `code-plugin` with the expected `1135` files and `1129301` uploaded bytes.
- Production build, TypeScript typecheck, the full test suite, runtime closure validation, OpenClaw production binding validation, strict OpenSpec validation, and npm dry-run packaging all passed. The package-worker semantic-route tests also leave zero `.tmp/package-worker-route-adapter-*` directories after success or initialization failure.
- This evidence remains local prepublication evidence only. Tasks 2.1-2.5, 5.2, and 5.3 remain unchecked; `production_learning_ready` and `support_claim_allowed` remain false until the exact npm and ClawHub artifacts pass the published-artifact gates.

## 6. Real-Host Remediation Contract

- [x] 6.1 Record the real-host review finding that S1-S6 remain valid while S7 delivery evidence is incomplete.
- [x] 6.2 Freeze runtime-closure/tooling separation, installed-artifact/live-host evidence separation, signed install origins, transactional installation, explicit security approval, activation preparation, strict verification, and split artifact/support conclusions.

## 7. Single Runtime Closure Authority

- [x] 7.1 Remove distribution validation tooling from the production runtime closure unless imported by a production entrypoint.
- [x] 7.2 Generate the complete package-local runtime dependency closure into the manifest.
- [x] 7.3 Make OpenClaw staging copy exclusively from the embedded manifest plus required package/plugin metadata.
- [x] 7.4 Validate staging and unpacked final tarball closure and reject undeclared runtime imports.

## 8. Installation Attestation And Transaction

- [x] 8.1 Add immutable HMAC-signed per-generation install attestations with explicit origin and registry-evidence requirements.
- [x] 8.2 Add constrained host-native attestation bootstrap after closure/home/lifecycle verification.
- [x] 8.3 Make install, repair, upgrade, interrupted upgrade, and rollback preserve the previous working installation on failure.
- [x] 8.4 Add closure-bound explicit security-scan approval, stable normalized scan digests, and `EE_OPENCLAW_SECURITY_APPROVAL_REQUIRED`.

## 9. Host Evidence And Operator Surface

- [x] 9.1 Rename/reclassify direct Node smoke as installed-artifact evidence.
- [x] 9.2 Add a real OpenClaw host runner covering install, isolated Gateway service, real turn, authority audit, queue completion, stale-output rejection, restart recovery, and shutdown.
- [x] 9.3 Add read-only exact-revision initialization preparation.
- [x] 9.4 Persist stable runtime-health failures and include the stable code in the primary Gateway log message.
- [x] 9.5 Add strict `ee verify openclaw-production` non-zero automation semantics.
- [x] 9.6 Separate `artifact_runtime_validated` from `support_claim_allowed`.
- [x] 9.7 Prove cold host-native initialization through the real OpenClaw user-command channel, including read-only preparation, exact-revision initialization, and idempotent replay.

### Local-Pack Real OpenClaw Host Preflight Evidence

- The final preflight used OpenClaw `2026.4.1 (da64a97)` on Linux x64 under WSL with Node `v25.5.0`.
- The exact local tarball passed manifest-driven staging and final-archive validation with closure digest `41882a3c00f16f313abd306f9ad48c4cc5e09aa21a5f3c88995e4c81b53a8ef0` and package build id `build_e73ef017486b8f5bb8d9ff83995ebc6b3c371123ba531449a9ea4120333e3dbd`.
- OpenClaw's default security scan blocked the package on explicit runtime/network/process patterns. The validator normalized the scan, recorded digest `b9b919519513927b1a9f94714b676a5fe08e3f3a58ee853dc3517b5748655760`, and retried only after explicit approval.
- The first Gateway service start preserved the empty package activation state and returned `package_activation_initialization_required`; it did not create launch authority implicitly.
- The validator sent `/experienceengine_prepare_package_activation` through the real authorized `chat.send` user-command path, read the exact plugin JSON from the final Gateway chat event, and proved the complete activation/process authority snapshot was unchanged.
- The validator then sent `/experienceengine_initialize_package_activation` with the exact returned package generation, projection revision, launch revision, control request id, and authorization id. Replaying the identical command payload returned the original result and left exactly one control request and one launch authorization.
- The same isolated Gateway then completed a real agent turn, established current production activation, completed one fenced semantic job, rejected stale output after configuration authority changed, recorded interruption without content retry, restarted with fresh process authority, and terminalized worker/supervisor state on shutdown.
- The run exited successfully with `interaction_active = true`, `learning_runtime_active = true`, `production_learning_ready = false`, `artifact_runtime_validated = false`, and `support_claim_allowed = false` because this was local-pack preflight rather than npm/ClawHub published evidence.

### Native Windows Local-Pack Real-Host Evidence

- The native Windows preflight used OpenClaw `2026.4.1 (da64a97)` on `win32-x64` with Node `v24.3.0` and the same manifest-driven local tarball closure digest `41882a3c00f16f313abd306f9ad48c4cc5e09aa21a5f3c88995e4c81b53a8ef0`.
- Windows `.cmd` resolution selected the validated Node/OpenClaw entrypoint without shell concatenation. Gateway health and authorized activation commands used authenticated direct Gateway RPC because the Windows CLI call path is not used as lifecycle authority.
- The Windows run independently proved fail-closed security scanning, explicit approval, empty-control-plane preparation, exact-revision initialization, idempotent replay, a real agent turn, fenced semantic completion, stale-output rejection, interruption recovery without content retry, and fresh authority after Gateway restart.
- A Windows-only stdin bridge triggered OpenClaw's existing `SIGINT` Gateway lifecycle in the same process. Both Gateway stops reached plugin-service shutdown and produced authoritative `worker = stopped`, `supervisor = stopped`, `graceful_release`, and `supervisor_graceful_release` database evidence instead of force-terminating the process tree.
- The native Windows report remained correctly bounded to `local_pack_live_host_preflight`: `production_learning_ready = false`, `artifact_runtime_validated = false`, and `support_claim_allowed = false`.

### Latest Stable WSL OpenClaw Compatibility Evidence

- The WSL host was upgraded from split OpenClaw `2026.3.8`/`2026.4.1` installations to one managed OpenClaw `2026.7.1 (2d2ddc4)` package and shell entrypoint using official Node `24.18.0`; Gateway readiness, deep status, RPC, and config audit passed before ExperienceEngine validation.
- OpenClaw `2026.7.1` loads startup plugins and command registries independently and moves agent credentials toward `openclaw-agent.sqlite`. The plugin now shares one deferred package-local service across equivalent registry loads, while the validator waits for a non-unavailable runtime status and uses OpenClaw's own non-interactive doctor migration only inside temporary state when a legacy JSON auth store coexists with an empty SQLite store.
- The exact local-pack run then passed real plugin installation, installed closure verification, read-only activation preparation, exact-revision initialization, idempotent replay, a real authenticated model turn, semantic queue completion, stale-authority rejection, interruption recovery, Gateway restart recovery, and two graceful terminal shutdowns.
- The run used closure digest `5058539fc8ab04b8ef63ddd69366b23a27b7580d2870a6f10a82b87ae0f21a4a` and package build id `build_87addcfcacd4bc4bf34cd3cc8a97d8d9a61fd6c265a4d84d83c1c2ce1449fdcf`. It exited with `interaction_active = true`, `learning_runtime_active = true`, `production_learning_ready = false`, `artifact_runtime_validated = false`, and `support_claim_allowed = false` because the artifact was still local-pack evidence.

### Remaining Publication Gates

- Tasks 2.1–2.5, 5.2, and 5.3 remain incomplete until a new exact npm and ClawHub version containing the current closure is published and independently passes all eight ordered steps.
- Task 5.4 is complete for the frozen OpenClaw `2026.4.1` local-pack host matrix on Linux/WSL and native Windows, plus latest-stable OpenClaw `2026.7.1` on WSL. This does not substitute for exact npm or ClawHub published-artifact validation.
