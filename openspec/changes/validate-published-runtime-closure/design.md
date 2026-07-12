## Context

The canonical target is one package containing the OpenClaw plugin, package-local supervisor, package-local worker, runtime dependencies, SQLite schema/migrations, and packaged profile registry. The global `ee` CLI remains an optional operator fallback. The ClawHub artifact may be a deliberate reduced closure only if every declared runtime role and dependency remains present.

The product must distinguish source-repo validation, local packed-artifact validation, published npm validation, published ClawHub validation, and live host validation.

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

## Goals / Non-Goals

**Goals:**

- Verify actual downloaded npm and ClawHub artifacts independently.
- Prove clean-home runtime bootstrap and production activation from package-local entrypoints.
- Prove Windows executable detection/version probing on supported OpenClaw install forms.
- Prove no hidden dependency on a global `ee` command.
- Reconcile public docs only after real evidence exists.

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

### 3. Run a clean-home activation sequence

The validation starts without an existing EE home or global CLI dependency, installs through the channel under test, resolves one home, bootstraps schema/config authority, launches supervisor/worker, completes production activation, claims deterministic test work, and shuts down safely.

### 4. Validate Windows command resolution explicitly

Doctor and repair fallback use a bounded resolver that checks supported executable forms such as command shims and platform extensions. An extensionless `openclaw` lookup is not sufficient evidence.

Canonical package-local activation does not invoke a global `openclaw` command at all. It is triggered by the host plugin service lifecycle and package-local entrypoints.

### 5. Gate documentation by evidence class

Public docs may describe a channel as supported only when that exact channel's artifact and live-host gates pass. Source-only or local-pack evidence must be labeled accordingly.

### 6. Preserve activation truth during validation

The harness reads authoritative status/handshake/queue evidence. It cannot substitute process presence, plugin load, files, or log text for `learning_runtime_active` and `production_learning_ready`.

## Risks / Trade-offs

- [Risk] Published-channel validation can be slow or flaky. → Mitigation: deterministic fixtures, bounded probes, stable evidence records, and separate infrastructure failure reporting.
- [Risk] A cached package can hide publication mistakes. → Mitigation: isolated cache/home and digest verification of downloaded bytes.
- [Risk] Host versions vary. → Mitigation: record exact OpenClaw version/resolution evidence and enforce declared compatibility ranges.
- [Risk] Docs can get ahead of validation. → Mitigation: make doc tasks last and require linked evidence.

## Acceptance Gate

- Actual published npm and ClawHub artifacts each pass closure inspection independently.
- Clean-home live activation, one deterministic queue item, authority-loss safety, and shutdown pass for required channels/hosts.
- Windows executable resolution and version probing pass on supported forms.
- Public docs state only the behavior proven by linked evidence.
- `pnpm exec openspec validate validate-published-runtime-closure --strict` passes.
