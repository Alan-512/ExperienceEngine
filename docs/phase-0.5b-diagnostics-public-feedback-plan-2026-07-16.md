# Phase 0.5B Diagnostics And Public Feedback Plan

**Created:** `2026-07-16`

**Status:** Closed-scope plan and OpenSpec slicing approved. D1 safe diagnostic manifest is source-accepted; D2 archive and D3 public feedback remain open.

**Depends on:** Phase 0.5A S1-S8 and the published `0.5.1` acceptance boundary.

## 1. Goal

Make failed activation, blocked learning, and harmful intervention behavior safely reportable without adding remote telemetry or exposing user content, repository identity, absolute paths, credentials, provider responses, or runtime authority data beyond bounded diagnostic projections.

The normal flow is review-first:

```text
local read-only collection
  -> exact manifest in a new review directory
  -> user review or field removal
  -> explicit archive command
  -> user-controlled issue attachment
```

Nothing is uploaded automatically.

## 2. Current-State Findings

The repository already provides useful pieces, but no existing surface satisfies the Phase 0.5B privacy and immutability contract by itself.

### Reusable foundations

- `resolveExperienceEnginePaths` resolves the current product/runtime homes.
- runtime identity already reserves the `diagnostic-identity-v1` HMAC domain.
- `readMachineIntegrityKey` and `hmacMachineIntegrityInput` provide the existing machine-bound identity primitive.
- host install-state locations can be resolved without mutation; richer existing host inspectors are not uniformly safe for diagnostic collection.
- runtime activation status already derives bounded authority, migration, queue, and capability projections.
- the core and control schemas retain stable failure/terminal codes and state timestamps.
- package version, platform, Node version, and distribution inspection already exist as structured values.

### Unsafe reuse boundaries

- CLI `status`, `doctor`, and `inspect` output is presentation text and may include absolute paths in verbose/operator modes. It must not be captured as bundle content.
- current Codex install inspection opens and bootstraps SQLite to derive learning-loop state. The diagnostic collector must not call it or any other inspector without an explicit read-only contract.
- `ExperienceInteractionService` opens and bootstraps the database. A diagnostic collector must not instantiate it.
- `openDatabase` creates parent directories and opens writable SQLite. Diagnostic collection needs a separate existing-file-only, read-only connection.
- `ExperienceStateArtifactService` intentionally copies SQLite, settings, and install-state files and records the absolute product home. It is not a diagnostic-bundle implementation.
- raw `last_error`, prompts, task summaries, tool payloads, trace snapshots, and provider messages are not safe default diagnostic inputs.

## 3. Product Surfaces

Phase 0.5B adds these operator surfaces:

```text
ee diagnose
ee diagnose --prepare-bundle [--output-dir PATH] [--include-model-id]
ee diagnose --archive <review-directory> [--output PATH]
```

### `ee diagnose`

Prints a concise local summary derived from the same safe manifest collector. It does not create a review directory, archive, runtime home, machine key, or database.

### `ee diagnose --prepare-bundle`

Creates a new review directory containing exactly one file:

```text
manifest.json
```

The command refuses to overwrite an existing review directory. By default the directory is created under the managed product home diagnostic-review area. An explicit output root is allowed only after path validation and still creates a fresh child directory.

The user may inspect the exact values and remove optional fields before archive creation. Unknown fields and unsafe additions are rejected later by the archive validator.

### `ee diagnose --archive <review-directory>`

Validates the reviewed manifest and creates a shareable archive only after an explicit command. It refuses extra files, symbolic links, path escapes, unknown manifest fields, unsafe opt-in combinations, invalid schema versions, and output overwrite.

The archive contains only the reviewed `manifest.json`.

## 4. Diagnostic Manifest Contract

Initial contract identifiers:

```text
diagnostic-manifest-v1
diagnostic-collection-policy-v1
diagnostic-error-aggregation-v1
diagnostic-review-directory-v1
diagnostic-archive-v1
```

The manifest is strict and versioned. Unknown fields fail validation rather than being copied through.

### Required top-level sections

```text
diagnostic_manifest_schema_version
collection_policy_version
generated_at
product
environment
setup
runtime
capabilities
provider
database
counts
time_ranges
errors
privacy
```

### Product and environment

Allowlisted fields:

- package name and version
- distribution channel when structured evidence exists
- OS family and architecture
- Node major version
- installed host families and safely parsed host versions

No raw executable path, package root, install path, home directory, username, or repository location is included.

### Setup, runtime, and capabilities

Allowlisted fields:

- setup state
- quality profile
- core learning quality classification
- learning health
- first-value state
- package activation state and revision
- migration state and schema version
- supervisor state and lease epoch
- worker state and fencing token
- queue state and bounded counts
- per-capability assurance, route classification, and health

Authority identifiers are represented only as bounded prefixes when needed:

```text
home_id_prefix
package_generation_id_prefix
configuration_generation_id_prefix
claim_id_prefix
```

No raw process command line, PID/start-token pair, lease owner id, route secret, or absolute path is included.

### Provider identity

Default:

- provider family may be included
- exact model id is excluded
- endpoint URL, deployment name, API key, token, headers, and provider response are excluded

With explicit `--include-model-id` consent:

- the exact configured model id may be included
- the manifest records `privacy.exact_model_id_included = true`

Endpoint/deployment identities, when later supported, are represented only by a bounded prefix of:

```text
HMAC(machine_integrity_key, "diagnostic-identity-v1\0" || normalized_identity)
```

The collector must never create or rotate the machine key. If the existing key cannot be read, optional fingerprints are omitted and one stable diagnostic warning code is emitted.

### Database health, counts, and time ranges

The collector opens SQLite only when the configured database file already exists, using an existing-file-only read-only connection.

It may derive only:

- `PRAGMA quick_check` pass/fail classification without raw SQLite messages
- schema and migration state
- allowlisted row counts grouped by stable state columns
- oldest/newest timestamps for allowlisted tables
- blocked/failed/discarded counts by stable code/category

It must not execute bootstrap, DDL, repair, migration, checkpoint, vacuum, or mutation statements.

### Stable error aggregation

Errors are derived only from allowlisted stable-code columns in known tables. Initial sources include:

- candidate failure/terminal fields
- distillation job failure/terminal fields
- launch authorization and launch-attempt terminal codes
- supervisor/worker last failure codes
- migration last error code
- configuration/route validation stable failure codes
- activation/control stable failure codes

Each output row is bounded and structured:

```text
error_code
failure_class
failure_scope
component
latest_timestamp
occurrence_count
retryable
home_id_prefix
package_generation_id_prefix
configuration_generation_id_prefix
supervisor_lease_epoch
worker_fencing_token
claim_id_prefix
```

Fields are omitted when not applicable. Raw `error.message`, `last_error`, stack traces, SQL text, tool output, and provider text are never copied.

Retryability comes only from a versioned stable-code map. Unknown codes use `retryable = null`; they are not guessed from text.

## 5. Privacy And Content Boundary

The default manifest and archive must not include:

- SQLite database files or WAL/SHM files
- settings files or environment dumps
- raw task/input/outcome records
- prompts or excerpts
- source code or repository names
- absolute paths or usernames
- tool arguments or tool output
- raw trace capsules/events/evidence references
- provider requests or responses
- API keys, tokens, credentials, headers, or endpoint URLs
- arbitrary free-text errors
- exact custom deployment names
- install-state files

The privacy section records explicit negative assertions so validators and issue templates can check the boundary:

```text
raw_database_included = false
raw_content_included = false
absolute_paths_included = false
credentials_included = false
provider_payloads_included = false
exact_model_id_included = false | true
```

## 6. Review Directory And Archive Safety

### Review directory

- a fresh identifier is generated for every preparation
- existing paths are never reused or overwritten
- the directory contains exactly `manifest.json`
- file mode is user-only where the host supports it
- symlinks and junction-like escapes are not accepted

### Archive

The initial portable format is deterministic `.tar.gz`, implemented with a maintained archive library rather than a custom tar writer or shell-specific command.

Archive creation:

- validates the review-directory contract first
- parses and revalidates the exact manifest
- archives only the single allowlisted file
- uses normalized archive path, mode, ownership metadata, and timestamp
- sorts entries deterministically
- writes to a new output path atomically
- reports archive SHA-256 and byte size
- never uploads the result

The added runtime dependency must be included in package-closure and published-artifact validation.

## 7. Authority And Mutation Boundary

Diagnostic collection is a read-only operator projection. It must not:

- initialize runtime home identity
- create/rotate a machine integrity key
- bootstrap or migrate SQLite
- change package activation
- create/consume launch authorization
- acquire/renew/terminalize supervisor or worker authority
- claim/recover/complete queue work
- write configuration generations or route authority
- change node/candidate/delivery/attribution state
- persist a diagnostic ledger in the runtime authority database

The review directory and archive are ordinary user-owned files outside runtime authority.

## 8. OpenSpec Slicing

```text
D1 add-safe-diagnostic-manifest
  -> D2 add-diagnostic-review-archive
     -> D3 add-public-feedback-infrastructure
```

### D1 — Safe diagnostic manifest

Owns:

- strict manifest types and validators
- read-only database connection and allowlisted collectors
- HMAC identity prefixes
- stable error aggregation
- concise `ee diagnose`
- fresh review-directory preparation
- focused privacy/non-mutation tests

Held closed until:

- D2 archive validation proves the reviewed manifest is the only shareable payload

Current implementation status, `2026-07-16`:

- strict manifest, read-only collector, stable error aggregation, HMAC prefix, `ee diagnose`, and one-file review preparation are implemented
- source and built CLI empty-home non-mutation smoke passed
- D1 tests/full gates passed
- archive remains unavailable and the end-to-end public sharing flow is not yet supported

### D2 — Diagnostic review archive

Owns:

- exact review-directory validator
- deterministic `.tar.gz` creation
- archive integrity output
- path/symlink/extra-file/overwrite rejection
- package dependency and closure updates
- real clean-home archive fixture

Held closed until:

- D3 public templates and docs request only the reviewed artifact

### D3 — Public feedback infrastructure

Owns:

- installation issue template
- runtime bug issue template
- harmful intervention issue template
- feature request issue template
- root `CONTRIBUTING.md`
- root `SECURITY.md`
- README/user-guide diagnostic workflow
- final real operator acceptance and published-package gate

## 9. Validation Strategy

Every slice requires focused tests plus proportional repository gates.

Required end-to-end fixtures:

1. uninitialized home produces a safe manifest without creating home/key/database
2. initialized empty database produces counts without content
3. populated database emits only allowlisted counts/time ranges/stable codes
4. exact model id remains excluded by default and appears only with explicit consent
5. missing key omits fingerprints without creating a key
6. raw error strings, paths, repository identity, secrets, and trace content never appear
7. edited manifest with unknown or unsafe fields is rejected
8. extra review-directory file or symlink is rejected
9. archive is deterministic and contains only `manifest.json`
10. actual installed package can prepare, validate, and archive a clean-home diagnostic review

## 10. Completion Boundary

Phase 0.5B is complete only when:

- D1-D3 are implemented and strict-valid
- the actual CLI produces an inspectable review directory
- independent validation proves the archive contains only the reviewed manifest
- public templates request the reviewed manifest/archive instead of raw data
- source, local-pack, and published-package evidence are clearly distinguished
- no remote telemetry exists
- `support_claim_allowed=false` and `production_learning_ready=false` remain unchanged unless a later independently approved phase changes them

Phase 0.6 does not begin automatically after this phase. It still requires a reproducible evidence-backed quality bottleneck and a separately approved optimization plan.
