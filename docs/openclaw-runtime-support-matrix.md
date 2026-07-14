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
| Local-pack real-host preflight | Passed | OpenClaw `2026.4.1`, Linux x64 under WSL, real `plugins install`, explicit security approval, Gateway service, agent turn, production queue, stale-output rejection, restart recovery, and shutdown. |
| Published npm `0.4.8` | Failed at step 1 | Exact registry artifact predates the embedded runtime closure manifest. |
| Published ClawHub `0.4.8` | Failed at step 1 | Exact ClawHub artifact predates the embedded runtime closure manifest. |
| New published npm candidate | Pending | Requires a new release containing the current closure and runtime implementation. |
| New published ClawHub candidate | Pending | Requires independent channel publication and validation. |
| Native Windows live host | Pending | Bounded `.exe`/`.cmd`/`.bat` resolution and quoting are tested, but an actual Windows OpenClaw host run is still required. |

## Support conclusions

`artifact_runtime_validated` becomes true only after the exact artifact passes installed-artifact and real-host validation. `support_claim_allowed` is stricter: it additionally requires the required channel/platform, repair/upgrade, documentation, and quality/benchmark publication gates.

Current conclusion:

```text
local_pack_live_host_preflight = passed
published_npm_artifact_runtime_validated = false
published_clawhub_artifact_runtime_validated = false
support_claim_allowed = false
```

The public documentation therefore describes OpenClaw routine interaction as available while keeping full production background learning pending published evidence.
