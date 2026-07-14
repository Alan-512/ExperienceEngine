## Context

The canonical target is one package containing the OpenClaw plugin, package-local supervisor, package-local worker, runtime dependencies, SQLite schema/migrations, and packaged profile registry. The global `ee` CLI remains an optional operator fallback. The ClawHub artifact may be a deliberate reduced closure only if every declared runtime role and dependency remains present.

The product must distinguish source-repo validation, local packed-artifact validation, installed-artifact runtime smoke, published npm validation, published ClawHub validation, and real OpenClaw live-host validation.

A real-host review proved that direct Node execution of the installed package is useful evidence but is not live-host evidence. It also exposed two authority contradictions: the OpenClaw tarball was assembled by a second import-scanner closure instead of the embedded runtime manifest, and host-native installation could not produce the persisted identity required by production binding. This remediation keeps the S1-S6 state machines intact while fixing those delivery boundaries.

## Normative Frozen Contract Import

This change imports `phase-0.5a.1-freeze-2026-07-11` Sections 4.18–4.20, 13–14, and 17.

The implementation SHALL mechanically encode and test:

- the complete embedded closure-manifest schema and digest rule;
- the complete external distribution-attestation schema and per-channel identity;
- the eight-step actual downloaded-artifact validation sequence;
- independent npm and ClawHub evidence records and support decisions;
- clean-home live activation evidence bound to authoritative S1–S6 rows;
- Windows doctor/repair executable resolution order, `PATHEXT` handling, bounded version probe, output record, safe `.cmd`/`.bat` invocation, and `EE_OPENCLAW_EXECUTABLE_UNRESOLVED` mapping;
- the rule that canonical package-local activation never invokes a global `openclaw` command and never requires a global `ee` command;
- source/local-pack/published/live-host evidence classification and documentation reconciliation.
- one runtime-closure packaging authority, with import scanning limited to undeclared-dependency detection;
- signed install-attestation origins and constrained host-native bootstrap;
- transactional install/repair/upgrade rollback and explicit security-scan authorization;
- read-only exact-revision activation preparation and strict production verification;
- separate `artifact_runtime_validated` and `support_claim_allowed` conclusions.

## Goals / Non-Goals

**Goals:**

- Verify actual downloaded npm and ClawHub artifacts independently.
- Prove clean-home runtime bootstrap and production activation from package-local entrypoints.
- Prove Windows executable detection/version probing on supported OpenClaw install forms.
- Prove no hidden dependency on a global `ee` command.
- Reconcile public docs only after real evidence exists.
- Correct already-overstated support wording immediately even when the replacement support claim remains pending.

**Non-Goals:**

- Treating source checkout execution as published evidence.
- Letting npm validation stand in for ClawHub validation or vice versa.
- Reopening S1-S6 protocol semantics.
- Publishing benchmark efficacy claims; S8 owns those claims.
- Claiming support from download count, package metadata alone, or plugin load alone.

## Decisions

### 1. Validate downloaded artifacts, not only pack previews

The release gate installs or downloads the exact published version from each channel into an isolated clean environment and derives observed closure from those bytes.

### 2. Compare declared and observed closure

Each artifact must contain every declared entrypoint, dependency, schema/migration asset, profile-registry asset, and compatibility file. Manifest identity and integrity are compared with the runtime package/home contract.

The generated `RuntimeClosureManifest` is the sole authority used by the OpenClaw staging packager. Distribution downloaders, validators, host runners, and smoke tooling are not production-runtime assets. The staging directory and the unpacked final tarball are both validated against the embedded manifest. Relative-import scanning is retained only to reject runtime imports that were not declared in the manifest.

### 3. Separate installed-artifact smoke from real-host validation

The installed-artifact smoke directly imports and executes package-local entrypoints from an isolated installed package. It proves artifact executability and S1-S6 behavior, but records `evidence_class = installed_artifact` and cannot satisfy the live-host step.

The real-host runner installs the exact candidate through OpenClaw, starts the real Gateway, observes plugin/service registration, completes host-native attestation and activation, executes a real agent turn, audits authoritative SQLite evidence, restarts the Gateway, verifies recovery, and shuts down cleanly.

### 4. Bind installation through signed attestations

Mutable installer convenience state is not runtime authority. A signed, create-once install attestation binds exact closure, package build, canonical home, installed root, OpenClaw lifecycle state directory, runtime versions, security approval, and origin. Supported origins are `local_pack`, `host_native_unattested`, `published_npm_attested`, and `published_clawhub_attested`.

The Gateway may create `host_native_unattested` only after exact closure, lifecycle root/state, canonical home/database, package metadata, and machine-key checks. It may not overwrite a conflicting attestation or manufacture registry evidence. Only an external validator/installer holding exact registry evidence may issue a published origin.

### 5. Make installation transactional

Candidate build and closure validation occur before any existing installation is changed. The installer then obtains or records explicit host-security approval, snapshots config/allow/install state, preserves the old plugin, installs the candidate, validates host info and installed closure, writes the candidate attestation, restarts/activates, and commits. Any failure restores the old plugin/config/attestation and leaves the active package generation unchanged.

### 6. Run a clean-home activation sequence

The validation starts without an existing EE home or global CLI dependency, installs through the channel under test, resolves one home, bootstraps schema/config authority, launches supervisor/worker, completes production activation, claims deterministic test work, and shuts down safely.

### 7. Validate Windows command resolution explicitly

Doctor and repair fallback use a bounded resolver that checks supported executable forms such as command shims and platform extensions. An extensionless `openclaw` lookup is not sufficient evidence.

Canonical package-local activation does not invoke a global `openclaw` command at all. It is triggered by the host plugin service lifecycle and package-local entrypoints.

### 8. Gate documentation by evidence class

Public docs may describe a channel as supported only when that exact channel's artifact and live-host gates pass. Source-only or local-pack evidence must be labeled accordingly.

### 9. Preserve activation truth during validation

The harness reads authoritative status/handshake/queue evidence. It cannot substitute process presence, plugin load, files, or log text for `learning_runtime_active` and `production_learning_ready`.

`artifact_runtime_validated` proves the exact artifact works in the recorded host/platform/version environment. `support_claim_allowed` additionally requires channel registry identity, required platform/repair/upgrade gates, documentation consistency, and the separate S8 quality/benchmark gate. The former may be true while the latter remains false.

## Risks / Trade-offs

- [Risk] Published-channel validation can be slow or flaky. → Mitigation: deterministic fixtures, bounded probes, stable evidence records, and separate infrastructure failure reporting.
- [Risk] A cached package can hide publication mistakes. → Mitigation: isolated cache/home and digest verification of downloaded bytes.
- [Risk] Host versions vary. → Mitigation: record exact OpenClaw version/resolution evidence and enforce declared compatibility ranges.
- [Risk] Docs can get ahead of validation. → Mitigation: make doc tasks last and require linked evidence.

## Acceptance Gate

- Actual published npm and ClawHub artifacts each pass closure inspection independently.
- OpenClaw staged and unpacked tarballs pass the same manifest validation and contain no required distribution-validation tooling.
- Default security scanning produces an explainable approval-required result; explicit digest-bound approval permits the candidate without weakening defaults.
- Host-native and EE-operated install paths produce valid, origin-correct signed attestations.
- Install, repair, upgrade, interrupted upgrade, and rollback preserve the prior working installation on failure.
- Clean-home live activation, one deterministic queue item, authority-loss safety, and shutdown pass for required channels/hosts.
- Real Gateway restart recovery and one real agent turn pass; direct Node smoke alone cannot satisfy this gate.
- Exact-revision initialization can be prepared read-only and strict production verification returns non-zero when inactive.
- Windows executable resolution and version probing pass on supported forms.
- Public docs state only the behavior proven by linked evidence.
- `pnpm exec openspec validate validate-published-runtime-closure --strict` passes.
