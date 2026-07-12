## Why

Source-repo tests cannot prove that npm or ClawHub users receive the package-local supervisor, worker, schemas, migrations, profile registry, dependencies, Windows executable handling, and live OpenClaw activation path. ExperienceEngine v0.4.8 already demonstrates that declared package behavior can differ from an actual downloaded artifact.

This seventh slice depends on S1-S6. It validates the real published closure independently for npm and ClawHub, then permits public documentation correction only after clean-home and live-host evidence pass.

## What Changes

- Add an independently verifiable published runtime-closure manifest for npm and ClawHub artifacts.
- Validate actual downloaded package contents, entrypoints, dependency closure, schema/migrations, profile registry, compatibility metadata, and artifact integrity.
- Validate clean-home install, package-local supervisor/worker startup, migration/bootstrap, configuration binding, production activation, queue pickup, authority loss, and shutdown through the published artifacts.
- Add Windows OpenClaw executable resolution and bounded version-probe behavior for doctor/repair fallback without coupling canonical package-local activation to a global command.
- Prove that the canonical OpenClaw path does not require a globally installed `ee` binary.
- Gate README, user guide, release notes, ClawHub presentation, and support-matrix updates on passing artifact evidence.

## Capabilities

### New Capabilities

- `published-runtime-closure`: Independent npm and ClawHub artifact-closure, clean-home, Windows, and live OpenClaw activation validation for the package-local production learning runtime.

### Modified Capabilities

- `agent-adapter-installation`: OpenClaw installation and doctor claims become channel-specific and evidence-bound; actual downloaded npm and ClawHub artifacts are validated independently.
- `openclaw-experience-plugin`: Full-learning support for the canonical plugin path is declared only after the installed channel proves package-local closure and live activation without global CLI dependencies.

## Impact

- Expected code areas: package files/build scripts, npm pack/publish validation, ClawHub packaging, install/repair/doctor, OpenClaw executable resolution, release scripts, host validation harnesses, README/user guide/release notes, and tests.
- Expected evidence: downloaded artifact digests, manifest comparison, entrypoint execution results, dependency/schema/profile checks, clean-home activation traces, Windows resolution probes, live-host status/queue evidence, and shutdown/upgrade results.
- Dependencies: S1-S6.
- Held closed until: both published channels pass their required gates; one channel cannot prove the other.
- Public support claims remain prohibited until this slice is accepted.
