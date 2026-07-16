## ADDED Requirements

### Requirement: Diagnostic collection is read-only and non-initializing

ExperienceEngine SHALL collect diagnostics without creating or mutating runtime home, machine key, SQLite schema, runtime authority, queue state, or semantic product state.

#### Scenario: Product home or database does not exist

- **WHEN** a user runs `ee diagnose` or prepares a review bundle
- **THEN** the collector SHALL report the unavailable state safely
- **AND** it SHALL NOT create a home directory, machine key, database file, schema, or authority row

#### Scenario: Existing database is inspected

- **WHEN** the configured SQLite file exists
- **THEN** it SHALL be opened existing-file-only and read-only
- **AND** bootstrap, DDL, migration, repair, checkpoint, vacuum, and write statements SHALL NOT run

### Requirement: The diagnostic manifest is strict and versioned

ExperienceEngine SHALL emit and validate one exhaustive `diagnostic-manifest-v1` object with a versioned collection policy.

#### Scenario: Unknown field is present

- **WHEN** collection or later review introduces an unrecognized field
- **THEN** strict validation SHALL fail
- **AND** the field SHALL NOT be copied through as arbitrary diagnostic content

#### Scenario: Optional section is unavailable

- **WHEN** an allowlisted source does not exist or cannot be inspected safely
- **THEN** the section SHALL use a declared unavailable/null representation or stable warning code
- **AND** the collector SHALL NOT substitute raw text

### Requirement: Default diagnostic content is allowlisted

ExperienceEngine SHALL include only the frozen product/environment, setup/runtime, capability, provider-family, database-health, count/time-range, stable-error, and privacy fields.

#### Scenario: Raw or identifying content is available locally

- **WHEN** databases, settings, tasks, prompts, source code, repository names, absolute paths, tool payloads, trace data, provider payloads, credentials, endpoint URLs, or free-text errors exist
- **THEN** none of that content SHALL enter the default manifest
- **AND** privacy assertions SHALL state that those categories are excluded

### Requirement: Diagnostic identities use the existing HMAC authority

ExperienceEngine SHALL derive optional diagnostic identity fingerprints with the existing machine integrity key and the `diagnostic-identity-v1` domain.

#### Scenario: Existing key is valid

- **WHEN** an allowlisted low-entropy identity requires a diagnostic fingerprint
- **THEN** the collector SHALL expose only a bounded HMAC prefix
- **AND** it SHALL NOT expose the full identity or key material

#### Scenario: Key is missing or invalid

- **WHEN** diagnostic collection cannot read the existing machine key
- **THEN** optional fingerprints SHALL be omitted with a stable warning
- **AND** the collector SHALL NOT create, rotate, repair, or replace the key

### Requirement: Database diagnostics expose derived health only

ExperienceEngine SHALL derive database health, allowlisted counts, and time ranges without including database content.

#### Scenario: Integrity check runs

- **WHEN** read-only SQLite inspection is available
- **THEN** the manifest SHALL record only a bounded pass/fail/unavailable classification
- **AND** raw SQLite diagnostic messages SHALL NOT be included

#### Scenario: State counts are collected

- **WHEN** allowlisted tables and columns exist
- **THEN** counts SHALL be grouped only by frozen state/category columns
- **AND** no task summary, node text, prompt, path, or payload column SHALL be selected

### Requirement: Error reporting uses stable codes only

ExperienceEngine SHALL aggregate errors only from allowlisted stable-code/state columns and a versioned retryability map.

#### Scenario: Stable failure rows exist

- **WHEN** multiple rows share the same stable code/component/class/scope
- **THEN** the manifest SHALL report a bounded aggregate count and latest timestamp
- **AND** applicable authority identifiers SHALL be bounded prefixes only

#### Scenario: Free-text error exists

- **WHEN** `last_error`, exception messages, stack traces, SQL text, or provider text exists beside a stable code
- **THEN** the free-text value SHALL NOT be selected or serialized

#### Scenario: Retryability is unknown

- **WHEN** a stable code is absent from the versioned retryability map
- **THEN** `retryable` SHALL be null/unavailable
- **AND** it SHALL NOT be inferred from message text

### Requirement: Review bundle preparation creates an exact one-file directory

ExperienceEngine SHALL prepare a fresh review directory containing only the strict `manifest.json`.

#### Scenario: Review directory is prepared

- **WHEN** the user runs `ee diagnose --prepare-bundle`
- **THEN** a new non-existing child directory SHALL be created
- **AND** `manifest.json` SHALL contain the exact values available for user review

#### Scenario: Target would overwrite existing content

- **WHEN** the proposed review directory already exists or escapes its validated output root
- **THEN** preparation SHALL fail without overwriting or deleting content

### Requirement: Exact model identity requires explicit consent

ExperienceEngine SHALL exclude exact model identity by default and include it only with explicit per-command consent.

#### Scenario: Default preparation runs

- **WHEN** no model-id opt-in is supplied
- **THEN** exact model id SHALL be absent
- **AND** the privacy section SHALL record that it was excluded

#### Scenario: User opts in

- **WHEN** `--include-model-id` is supplied
- **THEN** the configured model id MAY be included
- **AND** the privacy section SHALL record the explicit inclusion
