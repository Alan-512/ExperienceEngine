## ADDED Requirements

### Requirement: Archive input is the exact validated review directory

ExperienceEngine SHALL archive only a review directory containing one regular `manifest.json` file.

#### Scenario: Exact review directory is valid

- **WHEN** the directory contains only a regular `manifest.json` whose strict contract passes
- **THEN** it MAY proceed to archive creation

#### Scenario: Extra or linked content exists

- **WHEN** any additional entry, symbolic link, junction-like escape, non-regular file, or path escape is observed
- **THEN** archive creation SHALL fail
- **AND** none of the unexpected content SHALL be read into the archive

### Requirement: Reviewed manifests are revalidated at archive time

ExperienceEngine SHALL parse and strict-validate the exact edited manifest immediately before archive creation.

#### Scenario: User removes optional fields

- **WHEN** the remaining manifest still satisfies the strict contract
- **THEN** the edited manifest MAY be archived exactly

#### Scenario: User adds unknown or unsafe fields

- **WHEN** an unknown field, invalid privacy assertion, or unconsented exact identity appears
- **THEN** validation SHALL fail
- **AND** no archive SHALL be created

### Requirement: Diagnostic archives are deterministic and content-minimal

ExperienceEngine SHALL produce a deterministic `.tar.gz` containing only `manifest.json` with normalized metadata.

#### Scenario: Same reviewed manifest is archived twice under identical contract inputs

- **WHEN** archive generation is repeated to different new output paths
- **THEN** archive bytes and SHA-256 SHALL match
- **AND** the archive entry list SHALL contain exactly `manifest.json`

### Requirement: Archive output is atomic and never overwrites

ExperienceEngine SHALL commit archive output atomically to a new path.

#### Scenario: Output already exists

- **WHEN** the requested archive target exists
- **THEN** creation SHALL fail without replacing, truncating, or deleting it

#### Scenario: Archive succeeds

- **WHEN** validation and archive creation complete
- **THEN** the CLI SHALL report the local archive path, SHA-256, and byte size
- **AND** it SHALL state that no upload occurred

### Requirement: Archive support is present in distributed artifacts

ExperienceEngine SHALL include the archive runtime dependency and entrypoint in package closure validation.

#### Scenario: Installed artifact runs archive flow

- **WHEN** an actual installed package prepares and archives a clean-home diagnostic manifest
- **THEN** the archive dependency SHALL resolve from the installed artifact
- **AND** the same safety contract SHALL pass outside the source tree
