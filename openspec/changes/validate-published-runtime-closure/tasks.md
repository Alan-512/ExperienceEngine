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

## 3. Platform And Upgrade Coverage

- [ ] 3.1 Implement bounded Windows OpenClaw executable resolution and version probing for supported doctor/repair fallback command forms.
- [ ] 3.2 Add clean install, same-version repair, upgrade, interrupted upgrade, and rollback artifact scenarios required by the frozen contract.
- [ ] 3.3 Record exact package, host, platform, home, activation, and artifact evidence for each run.
- [ ] 3.4 Limit Windows executable resolution to doctor/repair fallback and add safe `.cmd`/`.bat` quoting tests that forbid broad shell concatenation.

## 4. Documentation Reconciliation

- [ ] 4.1 Update README, README.zh-CN, and user guide only after the corresponding published channel passes.
- [ ] 4.2 Correct ClawHub/npm install, upgrade, PATH, background-learning, provider, and status claims to match validated reality.
- [ ] 4.3 Add release notes and a support/evidence matrix distinguishing source, packed, published, and live-host validation.
- [ ] 4.4 Update installer/doctor state so npm, ClawHub, package-local activation, global CLI fallback, and Windows doctor/repair command availability remain separate evidence dimensions.
- [ ] 4.5 Add OpenClaw plugin regressions proving plugin load alone and incomplete artifact closure never report full-learning support.

## 5. Validation

- [ ] 5.1 Run local packed-artifact closure tests as a preflight, not as final published evidence.
- [ ] 5.2 Run actual published npm validation.
- [ ] 5.3 Run actual published ClawHub validation.
- [ ] 5.4 Run required live OpenClaw and Windows validation paths.
- [ ] 5.5 Run TypeScript typecheck, full tests, build, and packaging checks.
- [ ] 5.6 Run `pnpm exec openspec validate validate-published-runtime-closure --strict`.
