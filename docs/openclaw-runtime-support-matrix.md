# OpenClaw Runtime Support And Evidence Matrix

This matrix separates routine plugin interaction, package-local runtime execution, real-host activation, published-channel evidence, and public support claims.

## Readiness projections

| Projection | Meaning | What does not satisfy it |
| --- | --- | --- |
| `interaction_active` | OpenClaw loaded the plugin and routine interaction is available. | Background worker process presence, queue files, or documentation claims. |
| `learning_runtime_active` | Current package, configuration, route, activation handshake, supervisor, worker, schema, and fencing authority are valid. | Plugin load alone or an old handshake. |
| `production_learning_ready` | Runtime authority is active and the exact published channel plus quality/publication gates have passed. | Source tests, local packs, or one host preflight. |

## Evidence classes

| Evidence | Current result | Scope |
| --- | --- | --- |
| Source/runtime closure | Passed | Generated manifest, package-local dependency closure, schema/migrations, profile registry, compatibility metadata. |
| Installed-artifact smoke | Implemented and tested | Direct isolated execution of exact installed package entrypoints; never substitutes for a real Gateway. |
| Local-pack real-host preflight | Passed | OpenClaw `2026.4.1` passed independently on Linux x64 under WSL and native `win32-x64`: real `plugins install`, explicit security approval, empty-control-plane prepare/initialize commands through `chat.send`, exact-revision idempotent replay, Gateway service, agent turn, production queue, stale-output rejection, restart recovery, and authoritative shutdown. |
| Latest-stable WSL compatibility | Passed for local-pack preflight | OpenClaw `2026.7.1` with Node `24.18.0`: startup plugin and command registries share one deferred package-local runtime, legacy JSON agent credentials are migrated into the isolated host SQLite auth store only when required, and the run proves a real model turn, semantic queue completion, stale-authority rejection, restart recovery, and two graceful terminal shutdowns. |
| Published npm `0.4.8` | Failed at step 1 | Exact registry artifact predates the embedded runtime closure manifest. |
| Published ClawHub `0.4.8` | Failed at step 1 | Exact ClawHub artifact predates the embedded runtime closure manifest. |
| Previous local `v0.5.0` candidate | Superseded; must not be published | The earlier tarball passed its then-current prepublication checks, but later documentation and remediation changes altered the package contents. Its README bytes no longer match the working tree, so it is historical evidence only and cannot be used as the release artifact. |
| Current remediation working tree | Gates passed; not a release artifact | Strict activation payload tests, PowerShell 7 inherited-module-path full tests, build, closure validation, production binding, OpenSpec strict validation, and a 1135-file npm dry-run passed. The projected archive is not a committed or publishable candidate. |
| Final exact `v0.5.0` candidate | Evidence-bound publication artifact | The publishable artifact must be rebuilt from the committed remediation release boundary and match the externally recorded size, integrity, closure digest, build id, and packaged-document hashes. A differently built archive is a different candidate and must be revalidated. |
| Published npm `0.5.0` | Passed | The exact `1133532`-byte registry artifact passed integrity, closure, clean-home installed runtime, OpenClaw `2026.7.1` native activation, real agent turn, protected queue, restart recovery, and graceful shutdown validation. |
| Published ClawHub `0.5.0` | Failed at live-host import | The independently downloaded artifact is byte-identical and its closure is valid, but the ClawHub native installer did not install declared runtime dependencies. Runtime inspection reports missing `@modelcontextprotocol/sdk` and `zod`; plugin import fails before native commands can register. |
| Published npm `0.5.1` | Passed all eight ordered steps | The independently downloaded `1138519`-byte npm artifact passed exact registry integrity, closure, isolated install, package-local runtime smoke, native OpenClaw `2026.7.1` activation, a real model turn, protected queue semantics, restart recovery, and graceful shutdown. |
| Published ClawHub `0.5.1` | Passed all eight ordered steps | The independently downloaded `3152331`-byte reduced ClawPack passed exact ClawHub metadata and digest checks, bundled dependency closure, ClawHub-native install, native activation, a real model turn, semantic completion, stale-authority rejection, interruption recovery, Gateway restart recovery, and two authoritative shutdowns. |
| Published npm `0.5.2` | Passed all eight ordered steps | The independently downloaded `1245199`-byte npm artifact matched SHA-256 `6fe2cc3e69adda56186bafb0b0bd6565cb3b605f89334597d5402dbef745e9b1` and passed closure, isolated install, deterministic native activation RPC, a real model turn, protected queue semantics, recovery, restart, and graceful shutdown. |
| Published ClawHub `0.5.2` | Failed at closure step 1; do not install | A later public upload exists, but the artifact contains only `49` files / `234543` bytes, omits `dist/` and the embedded runtime closure manifest, and fails with `EE_PUBLISHED_CLOSURE_SCHEMA_INVALID` / `read_embedded_manifest:ENOENT`. It is not the previously accepted reduced candidate and is superseded by the `0.5.3` repair. |
| Published ClawHub `0.5.3` | Passed all eight ordered steps | The independently reverse-downloaded `3156136`-byte reduced ClawPack matched SHA-256 `6cb0dc84568b07bd2f5d12bd426bf96199cb5205f596fc5145ece063af2f1cba`, passed exact closure and installed-runtime checks, then completed OpenClaw `2026.7.1` native activation, a real agent turn, fenced semantic completion, stale-authority rejection, interruption recovery, Gateway restart recovery, and graceful shutdown on Linux x64 under WSL. |
| Multi-scenario published-npm v5 | Independently validated; directional only | Nine completed arms across inject, correct-skip, and harm-recovery proved correct skip, zero false-positive delivery, deterministic harmful exposure, production feedback/quarantine, and fresh-session recovery. The one-repetition campaign is correctly `not_publishable`. |
| Native Windows live host | Passed for local-pack preflight | OpenClaw `2026.4.1`, Node `v24.3.0`, validated `.cmd` entrypoint resolution, authenticated direct Gateway RPC, real activation commands and agent turn, fenced queue semantics, restart recovery, and OpenClaw-owned graceful Gateway shutdown through the Windows stdin-to-`SIGINT` lifecycle bridge. This is not published-artifact evidence. |

## Support conclusions

`artifact_runtime_validated` becomes true only after the exact artifact passes installed-artifact and real-host validation. `support_claim_allowed` is stricter: it additionally requires the required channel/platform, repair/upgrade, documentation, and quality/benchmark publication gates.

Current conclusion:

```text
local_pack_live_host_preflight = passed
published_npm_artifact_runtime_validated = true
published_clawhub_0_5_1_artifact_runtime_validated = true
published_clawhub_0_5_2_available = true
published_clawhub_0_5_2_artifact_runtime_validated = false
published_clawhub_0_5_3_available = true
published_clawhub_0_5_3_artifact_runtime_validated = true
published_clawhub_latest = 0.5.3
support_claim_allowed = false
```

The package-local production runtime, exact npm `0.5.2` channel, and exact ClawHub `0.5.3` channel are runtime-validated. Public ClawHub `0.5.2` remains invalid and must not be installed by exact version; the unversioned marketplace install now resolves to validated `0.5.3`. The v5 multi-scenario campaign closes Phase 0.5C directional evidence, but it does not pass the separate general quality/publication gate, so `production_learning_ready=false` and `support_claim_allowed=false` remain required.
