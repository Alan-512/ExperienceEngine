## ADDED Requirements

### Requirement: Strict offline embedding profile
ExperienceEngine SHALL support a strict offline embedding profile that uses only staged or bundled local model assets.

#### Scenario: Strict offline profile blocks remote model fetch
- **WHEN** ExperienceEngine initializes semantic retrieval with the strict offline profile
- **THEN** the embedding runtime is configured to disallow remote model downloads
- **AND** model loading uses only the configured offline asset location or bundled asset path
- **AND** missing remote network access does not by itself cause a fallback to a remote provider

#### Scenario: Missing strict offline assets fail loudly
- **WHEN** strict offline profile is active
- **AND** required model assets are missing
- **THEN** ExperienceEngine fails the offline readiness check with a diagnostic naming the missing asset or manifest
- **AND** it does not silently switch to legacy retrieval unless the active profile explicitly allows legacy fallback

### Requirement: Offline model asset manifest
ExperienceEngine SHALL represent offline model assets with a versioned manifest.

#### Scenario: Manifest defines embedding space
- **WHEN** ExperienceEngine loads an offline embedding model
- **THEN** the manifest records provider/runtime id, model id, dimensions, preprocessing or model version, asset paths, checksums, license/source metadata, and manifest version
- **AND** the manifest identity is included in embedding metadata for generated node vectors

#### Scenario: Corrupted model asset is rejected
- **WHEN** strict offline profile validates a model asset
- **AND** the asset checksum does not match the manifest
- **THEN** ExperienceEngine reports the asset as corrupted
- **AND** it does not use the corrupted asset for embedding generation

### Requirement: Offline asset packs are importable
ExperienceEngine SHALL support operator-managed import of offline embedding asset packs for air-gapped environments.

#### Scenario: Asset pack import registers validated manifest
- **WHEN** an operator imports an offline embedding asset pack
- **THEN** ExperienceEngine validates the pack manifest and asset checksums before registration
- **AND** it writes a local manifest registry entry for the imported assets
- **AND** strict offline profile can resolve the imported model assets without remote network access

#### Scenario: Invalid asset pack is rejected
- **WHEN** an imported offline asset pack is missing required files or has checksum mismatches
- **THEN** ExperienceEngine rejects the pack registration
- **AND** it reports bounded diagnostics naming the failed manifest or asset validation

### Requirement: Embedding spaces are never mixed
ExperienceEngine SHALL compare vectors only when their embedding-space metadata is compatible.

#### Scenario: Compatible vectors can be compared
- **WHEN** a node embedding and query embedding have the same provider, model, version or preprocessing id, dimensions, and manifest identity when present
- **THEN** ExperienceEngine may use vector similarity for retrieval scoring

#### Scenario: Incompatible vectors are excluded from vector scoring
- **WHEN** a node embedding differs from the active query embedding space by provider, model, version, dimensions, or manifest identity
- **THEN** ExperienceEngine does not use that vector for cosine similarity
- **AND** the candidate may still be considered through lexical or other non-vector retrieval evidence
- **AND** diagnostics indicate that vector scoring was skipped because of embedding-space mismatch

### Requirement: Automatic vector migration
ExperienceEngine SHALL detect active embedding-space changes and provide a resumable vector migration path.

#### Scenario: Embedding-space change marks nodes pending migration
- **WHEN** the active embedding profile changes
- **AND** stored node embedding metadata does not match the new active embedding space
- **THEN** ExperienceEngine marks those nodes as pending migration or exposes them as pending migration in migration diagnostics
- **AND** those nodes are not compared against the new space until re-encoded
- **AND** vector scoring diagnostics state that the candidate was excluded from cosine scoring because migration is pending

#### Scenario: Migration re-encodes from retrieval text
- **WHEN** vector migration processes a node
- **THEN** ExperienceEngine uses the node's stored `retrieval_text` as the canonical re-encoding input
- **AND** it writes the new embedding and new embedding metadata after successful encoding
- **AND** it records migration completion for that node or batch

#### Scenario: Migration uses bounded database writes
- **WHEN** vector migration runs while ExperienceEngine may also serve runtime reads or writes
- **THEN** migration uses a migration lock or equivalent single-writer guard
- **AND** it writes in bounded chunks with retry/backoff for transient SQLite busy states
- **AND** it applies configured throttle gaps between chunks when throttling is enabled
- **AND** lock contention or busy retries are visible in migration diagnostics

#### Scenario: Migration is resumable after failure
- **WHEN** vector migration fails partway through a batch
- **THEN** ExperienceEngine records the failure and progress state
- **AND** a later migration run can continue without reprocessing already completed nodes unnecessarily
- **AND** incomplete nodes remain protected from incompatible vector comparison

### Requirement: Offline readiness is inspectable
ExperienceEngine SHALL expose offline embedding readiness and migration state through operator diagnostics.

#### Scenario: Doctor reports strict offline readiness
- **WHEN** an operator runs doctor or equivalent readiness inspection for embeddings
- **THEN** ExperienceEngine reports whether the active embedding profile is standard, local-download, or strict-offline
- **AND** it reports model manifest presence, checksum status, remote-fetch policy, and whether semantic retrieval is ready

#### Scenario: Doctor reports vector migration state
- **WHEN** embedding-space migration is pending, running, completed, or failed
- **THEN** doctor or inspection output includes bounded migration counts and the latest failure summary when present
- **AND** the output does not require reading raw database tables to understand migration readiness
