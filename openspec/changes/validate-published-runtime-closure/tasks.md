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
- [ ] 5.4 Run required live OpenClaw and Windows validation paths.
- [x] 5.5 Run TypeScript typecheck, full tests, build, and packaging checks.
- [x] 5.6 Run `pnpm exec openspec validate validate-published-runtime-closure --strict`.

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

### Local-Pack Real OpenClaw Host Preflight Evidence

- The final preflight used OpenClaw `2026.4.1 (da64a97)` on Linux x64 under WSL with Node `v25.5.0`.
- The exact local tarball passed manifest-driven staging and final-archive validation with closure digest `80035592ceea42c1aff9e3809c8a0c9b34d219c777227c2498478eb2a078390b` and package build id `build_e6b9ce3647e398c2e2184c7d03b679dd7105fe60542275ec6afd26023dd11e55`.
- OpenClaw's default security scan blocked the package on explicit runtime/network/process patterns. The validator normalized the scan, recorded digest `b9b919519513927b1a9f94714b676a5fe08e3f3a58ee853dc3517b5748655760`, and retried only after explicit approval.
- A real isolated Gateway loaded the installed plugin service, completed a real agent turn, established current production activation, completed one fenced semantic job, rejected stale output after configuration authority changed, recorded interruption without content retry, restarted with fresh process authority, and terminalized worker/supervisor state on shutdown.
- The run exited successfully with `interaction_active = true`, `learning_runtime_active = true`, `production_learning_ready = false`, `artifact_runtime_validated = false`, and `support_claim_allowed = false` because this was local-pack preflight rather than npm/ClawHub published evidence.

### Remaining Publication Gates

- Tasks 2.1–2.5, 5.2, and 5.3 remain incomplete until a new exact npm and ClawHub version containing the current closure is published and independently passes all eight ordered steps.
- Task 5.4 remains incomplete until the required native Windows live-host path passes in addition to the completed Linux/WSL real-host preflight and bounded Windows resolver tests.
