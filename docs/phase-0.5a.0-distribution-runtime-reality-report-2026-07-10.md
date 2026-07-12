# Phase 0.5A.0 Distribution And Runtime Reality Report

Date: 2026-07-10  
Release under test: ExperienceEngine v0.4.8  
Source commit: `67d67cdd8ddfcf3dd210c42a6efbc261e280620e`  
OpenClaw under test: `2026.6.11`

## 1. Status

Phase 0.5A.0 reality investigation is complete.

The result is a **no-go for claiming current ClawHub or OpenClaw full-learning support**.

The selected future architecture remains feasible, but it is not implemented or supported in v0.4.8:

```text
execution placement: package_local_companion
lifecycle ownership: package_local_supervisor
control surface: openclaw_native
shared state: one explicitly resolved ExperienceEngine home
```

The architecture decision is recorded separately in:

- `docs/phase-0.5a.0-openclaw-architecture-decision-2026-07-10.md`

This report does not authorize runtime implementation, OpenSpec creation, or canonical activation publication.

## 2. Executive Findings

1. The locally packed npm artifact is complete.
2. The published npm v0.4.8 artifact is byte-for-byte identical to the local pack.
3. The published ClawHub v0.4.8 artifact is a reduced 43-file package that omits both declared `dist` entrypoints.
4. An ordinary OpenClaw npm-spec install downloads the complete npm package into an OpenClaw-managed npm project.
5. An explicit `clawhub:` install downloads the reduced ClawHub artifact and fails because the OpenClaw plugin entrypoint is missing.
6. The managed npm install creates an internal `ee` shim, but it does not place `ee` on the user's normal `PATH`.
7. OpenClaw CLI inspection reports the npm-installed plugin as enabled and loaded, but live gateway startup does not activate ExperienceEngine in the tested clean environment.
8. The shipped OpenClaw runtime explicitly disables background learning and hybrid posttask processing, so its declared learning state is `interaction_only`.
9. The current distillation queue has no atomic job claim, worker identity, worker lease, or fencing token.
10. SQLite currently uses DELETE journal mode, a five-second busy timeout, and no schema version or migration owner.
11. Validation-only WAL prototypes proved one-winner worker lease acquisition, stale takeover, and serialized migration ownership, but the product runtime does not implement those protocols.
12. OpenClaw exposes a plugin service start/stop lifecycle seam, but it does not supervise or restart a child process after service startup returns.
13. Forced OpenClaw package replacement retains the old package generation on disk while activating a new generation path, so a companion requires version fencing and orphan cleanup.
14. In the tested Windows installation mode, `ee doctor openclaw` and `ee repair openclaw` cannot resolve a PATH-visible `openclaw.cmd` through the current Node `execFileSync("openclaw", ...)` call.

## 3. Evidence Boundary

The following evidence classes were tested independently:

| Evidence class | Result |
| --- | --- |
| Source tree | Inspected |
| Local `npm pack` artifact | Inspected |
| Published npm artifact | Downloaded and compared |
| Published ClawHub artifact | Inspected and downloaded |
| Clean OpenClaw npm-spec install | Executed |
| Clean explicit ClawHub install | Executed |
| Clean gateway startup and restart | Executed twice |
| `ee` PATH availability | Executed with a clean PATH |
| Shared-home resolution | Executed |
| SQLite contention | Executed with separate processes |
| Lease feasibility | Executed with separate processes |
| OpenClaw package replacement | Executed from v0.4.7 to v0.4.8 |
| EE doctor and repair on Windows | Executed |

Source-repo tests, historical host validation, registry metadata, and current published-package behavior are not treated as interchangeable evidence.

## 4. Artifact Closure

### 4.1 Source package declaration

`package.json` declares:

```text
CLI bin: ee -> dist/cli/index.js
OpenClaw extension: ./dist/plugin/openclaw-plugin.js
```

It also includes `dist`, `openclaw.plugin.json`, integration assets, and documentation in the npm package file list.

### 4.2 Local npm pack

The real v0.4.8 local tarball was produced through `npm pack` after the package prepack build.

| Property | Value |
| --- | --- |
| Compressed size | 701,644 bytes |
| File entries | 821 |
| CLI entrypoint present | Yes |
| OpenClaw entrypoint present | Yes |
| Background-learning runtime present | Yes |
| Distillation queue worker present | Yes |
| SQLite schema present | Yes |

The packaged OpenClaw defaults still contain:

```text
OPENCLAW_BACKGROUND_LEARNING_ENABLED = false
OPENCLAW_HYBRID_POSTTASK_ENABLED = false
```

The artifact therefore contains broad runtime code while the OpenClaw entrypoint deliberately exposes only the interaction-oriented mode.

### 4.3 Published npm artifact

The npm registry resolved `latest` to v0.4.8 during validation.

| Property | Value |
| --- | --- |
| Compressed size | 701,644 bytes |
| File entries | 821 |
| Unpacked size | 3,569,821 bytes |
| SHA-1 | `86685fe0cefb5eda65b37cc3c31bda1c5a3d27b7` |
| SHA-512 base64 | `VVxIDoIHOa7ZZcNCeI2j1NHZufxidongV4iSKaobLgRKJPCia2JRyzavxU1mOFEvMeM2eBroxhrqhO4josiRWw==` |

The published npm tarball is byte-for-byte identical to the local v0.4.8 pack.

There is no source-versus-published npm packaging drift for this release.

### 4.4 Published ClawHub artifact

ClawHub resolved `@alan512/experienceengine` v0.4.8 to the v0.4.8 source tag and commit, but the actual artifact closure differs materially from npm.

| Property | npm v0.4.8 | ClawHub v0.4.8 |
| --- | ---: | ---: |
| Compressed size | 701,644 bytes | 53,137 bytes |
| File entries | 821 | 43 |
| Unpacked size | 3,569,821 bytes | 168,883 bytes |
| `dist/cli/index.js` | Present | Missing |
| `dist/plugin/openclaw-plugin.js` | Present | Missing |

ClawHub digest evidence:

```text
SHA-256 6baf066b177adc33e0bba1a6d6bd2cdab3b4e563f4fff18ab1c9a31b36325c90
SHA-1   d2e3e21fa93d4d874029b993e44c0153ae5f2fc0
```

The ClawHub package still declares the missing OpenClaw extension and CLI paths in its metadata.

Therefore the published ClawHub v0.4.8 artifact is not an executable ExperienceEngine OpenClaw plugin package.

ClawHub's artifact analysis flags the missing runtime closure. Malware-oriented scans were clean, so the observed issue is package integrity rather than malware evidence.

The reduced artifact also contains a Claude marketplace installation script pinned to `@alan512/experienceengine@0.3.0`, which introduces a separate reviewed-artifact/runtime-version mismatch.

Registry download or install counters are not activation evidence.

## 5. OpenClaw Installation Reality

### 5.1 Ordinary npm-spec installation

The following shape was tested in an isolated OpenClaw state:

```bash
openclaw plugins install @alan512/experienceengine@0.4.8 --pin
```

Result:

- OpenClaw created a managed npm project under its own state directory.
- The managed project contained the complete published npm package.
- The declared OpenClaw plugin entrypoint existed.
- OpenClaw inspection reported ExperienceEngine v0.4.8 as enabled and loaded.
- Required package dependencies were present.

This command succeeds because OpenClaw treats the unprefixed package spec as an npm install.

It does not validate the ClawHub artifact.

### 5.2 Explicit ClawHub installation

The following shape was tested independently:

```bash
openclaw plugins install clawhub:@alan512/experienceengine@0.4.8
```

Result:

```text
extension entry not found: ./dist/plugin/openclaw-plugin.js
```

The plugin configuration was not committed.

### 5.3 `ee` PATH availability

The OpenClaw-managed npm project contains private shims:

```text
node_modules/.bin/ee
node_modules/.bin/ee.cmd
node_modules/.bin/ee.ps1
```

A clean user PATH cannot resolve `ee` because that private `.bin` directory is not added to the normal environment.

Therefore:

- package metadata proves npm can create an `ee` shim;
- OpenClaw managed installation does create one internally;
- OpenClaw installation does not make `ee` a normal global command;
- documentation must not instruct users to run `ee init` after OpenClaw installation without separately explaining how the CLI is installed or invoked.

## 6. Gateway Activation And Restart

The isolated gateway was configured for local loopback operation and started twice in succession.

Both runs reached HTTP listening and gateway-ready state.

However, the gateway reported only its seven built-in plugins during startup:

```text
browser
canvas
device-pair
file-transfer
memory-core
phone-control
talk-voice
```

ExperienceEngine did not appear in the live gateway plugin-loading set, and the explicitly configured shared ExperienceEngine home did not receive an ExperienceEngine database.

At the same time, `openclaw plugins inspect experienceengine --json` reported:

```text
enabled: true
activated: true
status: loaded
shape: non-capability
capabilityMode: none
hookCount: 0
services: []
```

The tested environment therefore exposes a control-plane/runtime discrepancy:

- package discovery and static inspection succeed;
- live gateway activation does not close;
- no task/runtime persistence was observed;
- the cause is not frozen by this report.

The correct product statement is **gateway activation unverified and blocked**, not “OpenClaw runtime loaded successfully.”

## 7. Current Packaged Capability Matrix

| Capability | Source/local package | Published npm | Published ClawHub | Tested live gateway |
| --- | --- | --- | --- | --- |
| CLI files present | Yes | Yes | No | Not PATH-visible |
| OpenClaw entrypoint present | Yes | Yes | No | Package discovered, not activated |
| Prompt/tool/finalize hook code present | Yes | Yes | No executable entrypoint | No live hook registration observed |
| Interaction-only policy | Yes | Yes | Artifact cannot start | No live runtime observed |
| Background candidate generation | Runtime code present, disabled at OpenClaw boundary | Same | Not executable | Unsupported |
| Queue processing | Runtime code present, disabled at OpenClaw boundary | Same | Not executable | Unsupported |
| Hybrid posttask review | Runtime code present, disabled at OpenClaw boundary | Same | Not executable | Unsupported |
| Package-local companion | Not implemented | Not implemented | Not packaged | Unsupported |
| Single-worker ownership | Not implemented | Not implemented | Not packaged | Unsupported |

The presence of runtime modules in a tarball does not make those capabilities supported through the OpenClaw entrypoint.

## 8. Shared Home Reality

Current path resolution supports an explicit shared home through:

```text
EXPERIENCE_ENGINE_HOME
```

When that value is set consistently, OpenClaw and another EE runtime resolve the same SQLite path.

Without an explicit shared home, defaults can diverge:

- OpenClaw may select the legacy compatibility home when compatibility data exists;
- another runtime may select the product home;
- plugin and worker can therefore operate on different databases.

The selected architecture must treat one explicit resolved home as a startup invariant, not an optional convenience.

User-declared settings should not be silently rewritten merely to record the resolved machine path. The resolved route belongs in runtime/validation state.

## 9. Worker Ownership Reality

### 9.1 Current queue claim behavior

The current distillation worker:

1. lists `pending` and retryable `failed` jobs;
2. sorts them;
3. selects a batch;
4. updates each selected job to `processing` through a normal upsert.

It does not use:

- an atomic conditional claim;
- a worker identity;
- a lease owner;
- a lease expiry token;
- a fencing token;
- a generation/version token.

Two worker processes can therefore list the same pending job before either one updates it.

### 9.2 Current stale recovery

`processing` jobs become stale after 150 seconds based on `updated_at`.

Current recovery converts stale processing into failure and increments the candidate retry counter.

This conflates worker/system interruption with candidate-content failure and conflicts with the future failure-semantics requirement.

### 9.3 Feasibility prototype

A validation-only SQLite WAL lease prototype was executed with separate processes.

Observed result:

- two concurrent contenders produced exactly one lease winner;
- the losing contender observed the current owner;
- after lease expiry, a third contender acquired ownership.

This proves the ownership primitive is feasible on the selected storage platform.

It does not mean the product runtime currently implements or validates the protocol.

## 10. SQLite Concurrency Reality

Current database startup applies:

```text
PRAGMA busy_timeout = 5000
PRAGMA foreign_keys = ON
```

Observed database state:

```text
journal_mode = delete
busy_timeout = 5000
user_version = 0
```

No runtime path currently enables WAL.

### 10.1 Writer contention

A two-process contention test held one write transaction for 6.5 seconds.

The second writer failed after approximately 5.8 seconds with:

```text
ERR_SQLITE_ERROR: database is locked
```

`busy_timeout` therefore bounds how long a writer waits. It does not prove cross-process safety, ownership, progress, or recovery.

### 10.2 Selected process model requirement

The package-local companion model requires:

- WAL for reader/writer coexistence;
- short database transactions;
- no provider or model call inside a write transaction;
- bounded busy retry with observable failure classification;
- idempotent producer records;
- one atomic learning-job owner;
- one migration owner;
- fencing for stale or superseded workers.

WAL is required for the target model, but WAL is not a substitute for worker ownership or migration serialization.

## 11. Schema Bootstrap And Migration Ownership

Current bootstrap behavior:

- executes the base schema;
- performs many `PRAGMA table_info` checks;
- runs conditional `ALTER TABLE ... ADD COLUMN` operations;
- does not set `PRAGMA user_version`;
- does not maintain a migration generation;
- does not acquire a migration lease;
- can be invoked by each runtime that constructs the service.

Two concurrent empty-database bootstrap processes happened to complete successfully in one validation run.

That result is not proof of legacy-schema migration safety because the tested database did not require competing ALTER operations.

A separate validation-only migration-owner prototype started two migrators concurrently against a version-zero database:

- exactly one migrator acquired the write transaction and advanced the schema version;
- the other migrator observed the completed target version and performed no migration;
- the final schema state had one version and no remaining migration owner.

This proves that serialized migration ownership is feasible with the same transactional SQLite model. The current runtime does not yet implement versioned migrations or this ownership protocol.

For the selected architecture:

- the package-local supervisor/companion must own schema bootstrap and migration;
- the plugin must not run opportunistic schema mutation;
- the plugin may only open a schema version it explicitly supports;
- migration must complete before the worker accepts queue work;
- gateway/plugin startup during migration must fail closed, remain read-only, or report a bounded warming state;
- migration ownership must use a lease and fencing token separate from candidate retry state.

## 12. OpenClaw Service Lifecycle Feasibility

OpenClaw `2026.6.11` exposes:

```text
api.registerService({ id, start, stop })
```

The gateway:

- invokes registered service startup;
- records startup failure;
- invokes service shutdown in reverse order.

The gateway does not monitor or restart a child process after the plugin service's `start` function returns.

This supports a package-local lifecycle trigger, but not complete companion supervision.

The selected architecture therefore assigns correctness ownership to a package-local supervisor:

- OpenClaw calls supervisor start/stop;
- the supervisor launches and monitors the worker;
- the worker holds the database lease;
- lease expiry and fencing prevent duplicate or stale work;
- the worker self-terminates when its supervisor heartbeat or generation is no longer valid.

## 13. Crash, Restart, And Orphan Reality

### 13.1 Current behavior

There is no OpenClaw companion worker today, so the following are not implemented:

- duplicate companion prevention;
- child crash restart;
- gateway-parent death detection;
- orphan worker detection;
- graceful worker drain;
- version fencing;
- lease-preserving restart recovery.

Current queue recovery only notices stale `processing` rows after timeout and consumes candidate retry.

### 13.2 Required target behavior

The future supervisor must define:

1. one worker lease per ExperienceEngine home;
2. owner id, process id, package version, generation id, heartbeat, expiry, and fencing token;
3. refusal to start a second healthy owner;
4. stale takeover only after lease expiry or verified owner death;
5. graceful pause, drain, and stop on gateway shutdown;
6. bounded child restart with system retry separate from candidate retry;
7. orphan self-termination when supervisor/generation heartbeat is lost;
8. queue writes rejected when the worker's fencing token is no longer current.

## 14. Package Upgrade Compatibility

The following sequence was tested:

1. install ExperienceEngine v0.4.7 through OpenClaw;
2. attempt a normal v0.4.8 replacement;
3. attempt `plugins update experienceengine`;
4. force installation of v0.4.8.

Observed behavior:

- exact v0.4.7 remained pinned during normal update;
- normal v0.4.8 replacement was rejected because the plugin already existed;
- forced v0.4.8 installation created a new generation-specific managed project;
- OpenClaw inspection switched to the new v0.4.8 generation;
- the old v0.4.7 managed project remained on disk.

Generation-separated paths prevent direct overwrite of an installed package generation.

They do not terminate an old running worker.

The selected architecture must bind the worker lease to:

```text
package identity
package version
artifact integrity or generation id
schema compatibility range
```

A new worker must not run concurrently with a healthy old worker against the same home. An old worker that loses generation ownership must stop and must be fenced from further writes.

## 15. Doctor And Repair Reality On Windows

The managed internal `ee` command was invoked directly in the isolated installation.

The OpenClaw command shim was visible to the Windows shell:

```text
where openclaw -> openclaw.cmd
openclaw --version -> succeeds
```

The equivalent Node call failed:

```text
spawnSync openclaw ENOENT
```

The published EE OpenClaw command runner currently calls:

```text
execFileSync("openclaw", ...)
```

Consequences in the tested Windows mode:

- `ee doctor openclaw` reports OpenClaw as absent/not installed;
- `ee repair openclaw` terminates with `ENOENT`;
- the documented repair path is not currently reliable for this installation mode.

This is a runtime defect to be addressed only after protocol freeze and implementation authorization.

## 16. Documentation Drift

The following statements require later correction, but were not modified in this phase:

- the user guide says OpenClaw uses the shared background learning loop by default;
- README installation ordering asks users to run `ee init` after OpenClaw managed installation without explaining that `ee` is not globally exposed;
- source-repo OpenClaw validation can be read as published-package validation unless the boundary is emphasized;
- “deepest host-native integration” can be misread as current full-learning activation.

No public documentation should claim ClawHub-only full learning until the selected architecture is implemented, published, and revalidated from the actual artifact.

## 17. Required Questions Answered

| Question | Answer |
| --- | --- |
| Does ClawHub install the full npm package? | No. The tested v0.4.8 ClawHub artifact is a reduced and incomplete closure. |
| Is `ee` executable without a separate global install? | Only through a private OpenClaw-managed shim path; not from the normal user PATH. |
| Can a package-local worker be launched safely now? | No. The host has a service start/stop seam, but EE lacks supervisor, lease, fencing, migration ownership, and activation closure. |
| Is the package-local companion architecture feasible? | Yes, subject to the selected supervisor, WAL, lease, migration, generation, and packaging requirements. |
| Do plugin and worker use the same home by default? | Not guaranteed. An explicit shared home is required. |
| What survives gateway restart? | OpenClaw installation/config state survives. No EE companion exists; live EE activation was not observed. |
| What is currently interaction-only? | The shipped OpenClaw entrypoint policy disables background learning and hybrid posttask processing. |
| Who prevents duplicate workers today? | Nobody; the current queue has no worker owner or atomic claim. |
| Who owns schema migration today? | No single owner; each runtime bootstrap can mutate schema. |
| Is WAL required? | Yes for the selected shared plugin/companion process model, but it is not sufficient alone. |
| Can an old worker remain alive after package upgrade? | Yes unless future supervisor shutdown, generation lease, and fencing prevent it. |
| Can gateway and worker race schema startup? | Yes under current bootstrap semantics. |
| How are orphan workers terminated today? | They are not; no companion lifecycle exists. |
| Does current repair recover OpenClaw on tested Windows setup? | No; command resolution fails with `ENOENT`. |

## 18. Exit Decision

Phase 0.5A.0 meets its investigation and architecture-decision purpose:

- claims are based on actual artifacts and clean-environment execution;
- distribution channels are separated explicitly;
- one architecture combination is selected;
- worker ownership and serialized migration feasibility are supported by validation-only WAL prototypes;
- the current unsafe runtime is rejected rather than relabeled as supported.

Phase 0.5A.0 does **not** establish a supported OpenClaw full-learning runtime.

Canonical activation must remain unpublished until later implementation and published-artifact validation succeed.

Phase 0.5A.1 remains subject to third-round protocol freeze review before any runtime work or OpenSpec slice is created.

## 19. Implementation Blockers Carried Forward

1. Repair the ClawHub package closure and verify its published artifact.
2. Close live gateway activation for the current OpenClaw SDK.
3. Add a package-local companion entrypoint.
4. Add a package-local supervisor registered through the OpenClaw service lifecycle.
5. Add atomic worker lease, heartbeat, stale takeover, and fencing.
6. Add atomic conditional job claim.
7. Separate system/worker retry from candidate-content retry.
8. Add WAL initialization and bounded contention handling.
9. Add schema versioning and one migration owner.
10. Freeze explicit shared-home resolution and compatibility behavior.
11. Add package generation/version compatibility and orphan cleanup.
12. Fix Windows OpenClaw executable resolution in doctor/repair.
13. Correct README and user-guide claims only after the product contract is frozen.

