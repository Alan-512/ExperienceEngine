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
| `v0.5.1` release candidate | ClawHub-form local real-host gate passed; exact committed candidate pending | The reduced ClawHub stage installs required dependencies in a clean npm root, packs them as ordinary bundled files, rejects links, and validates external imports. Its archive passed the complete WSL OpenClaw `2026.7.1` local-candidate host sequence with Node `22.21.0`. This is still not published-channel evidence. |
| Native Windows live host | Passed for local-pack preflight | OpenClaw `2026.4.1`, Node `v24.3.0`, validated `.cmd` entrypoint resolution, authenticated direct Gateway RPC, real activation commands and agent turn, fenced queue semantics, restart recovery, and OpenClaw-owned graceful Gateway shutdown through the Windows stdin-to-`SIGINT` lifecycle bridge. This is not published-artifact evidence. |

## Support conclusions

`artifact_runtime_validated` becomes true only after the exact artifact passes installed-artifact and real-host validation. `support_claim_allowed` is stricter: it additionally requires the required channel/platform, repair/upgrade, documentation, and quality/benchmark publication gates.

Current conclusion:

```text
local_pack_live_host_preflight = passed
published_npm_artifact_runtime_validated = true
published_clawhub_artifact_runtime_validated = false
support_claim_allowed = false
```

The package-local production runtime and exact npm `0.5.0` channel are validated. The `0.5.1` ClawHub repair still requires an exact immutable candidate, real-host prepublication evidence, publication, and independent published-channel validation. The separate quality/benchmark gate also remains open.
