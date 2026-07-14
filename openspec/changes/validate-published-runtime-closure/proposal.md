## Why

Source-repo tests cannot prove that npm or ClawHub users receive the package-local supervisor, worker, schemas, migrations, profile registry, dependencies, Windows executable handling, and live OpenClaw activation path. ExperienceEngine v0.4.8 already demonstrates that declared package behavior can differ from an actual downloaded artifact.

This seventh slice depends on S1-S6. A real OpenClaw host run demonstrated that the S1-S6 runtime authority contracts remain viable, but the S7 delivery chain still conflates installed-artifact execution with live-host evidence and cannot safely attest host-native installs. S7 therefore owns the closed-scope remediation from runtime closure through transactional installation, host-native activation, real-host evidence, and truthful support claims.

## What Changes

- Add an independently verifiable published runtime-closure manifest for npm and ClawHub artifacts.
- Make that runtime manifest the sole production-runtime packaging authority and keep distribution-validation tooling outside the required OpenClaw runtime closure.
- Validate actual downloaded package contents, entrypoints, dependency closure, schema/migrations, profile registry, compatibility metadata, and artifact integrity.
- Separate installed-artifact runtime smoke from real OpenClaw live-host validation.
- Add signed install attestations that distinguish local pack, host-native unattested, published npm, and published ClawHub origins without allowing one origin to impersonate another.
- Make OpenClaw install, repair, upgrade, and rollback transactional and require explicit user authorization before mapping a host security-scan approval to an unsafe-install flag.
- Validate clean-home host-native install, package-local supervisor/worker startup, migration/bootstrap, configuration binding, production activation, a real agent turn, queue pickup, authority loss, Gateway restart recovery, and shutdown through the published artifacts.
- Add Windows OpenClaw executable resolution and bounded version-probe behavior for doctor/repair fallback without coupling canonical package-local activation to a global command.
- Prove that the canonical OpenClaw path does not require a globally installed `ee` binary.
- Add read-only activation-request preparation, stable first-line lifecycle error codes, persisted runtime-health evidence, and a strict non-zero `ee verify openclaw-production` gate.
- Correct existing overstated documentation immediately; gate any later upgrade to a supported claim on passing artifact and real-host evidence.

## Capabilities

### New Capabilities

- `published-runtime-closure`: Independent npm and ClawHub artifact-closure, clean-home, Windows, and live OpenClaw activation validation for the package-local production learning runtime.

### Modified Capabilities

- `agent-adapter-installation`: OpenClaw installation and doctor claims become channel-specific and evidence-bound; actual downloaded npm and ClawHub artifacts are validated independently.
- `openclaw-experience-plugin`: Full-learning support for the canonical plugin path is declared only after the installed channel proves package-local closure and live activation without global CLI dependencies.
- `runtime-package-home-identity`: Package generation identity consumes a signed install attestation with an explicit origin instead of treating mutable installer state as runtime authority.
- `openclaw-production-activation`: Host-native lifecycle may create a constrained signed attestation only after exact closure/home/lifecycle verification, and exposes a read-only exact-revision initialization request.
- `cli-user-experience-surface`: Strict production verification and the three distinct runtime readiness projections are exposed without treating plugin load as production readiness.

## Impact

- Expected code areas: package files/build scripts, npm pack/publish validation, ClawHub packaging, install/repair/doctor, OpenClaw executable resolution, release scripts, host validation harnesses, README/user guide/release notes, and tests.
- Expected evidence: downloaded artifact digests, manifest comparison, entrypoint execution results, dependency/schema/profile checks, clean-home activation traces, Windows resolution probes, live-host status/queue evidence, and shutdown/upgrade results.
- Dependencies: S1-S6.
- Held closed until: both published channels pass their required gates; one channel cannot prove the other.
- Public support claims remain prohibited until this slice is accepted.
