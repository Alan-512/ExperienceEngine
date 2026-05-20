## ADDED Requirements

### Requirement: Project compatibility fingerprints
ExperienceEngine SHALL derive structured compatibility fingerprints for repository scopes.

#### Scenario: Fingerprint captures portability signals
- **WHEN** ExperienceEngine analyzes a repository scope for portability
- **THEN** it records a schema-versioned fingerprint including primary language, package manager, lockfile family, frameworks, database or ORM tools, test/build tools, host/runtime adapters, relevant config markers, and stable project markers when available
- **AND** it records a hash for fast equality checks
- **AND** it retains structured fields for inspection and scoring

#### Scenario: Monorepo fingerprint records workspace and project scope
- **WHEN** ExperienceEngine analyzes a project inside a monorepo or package workspace
- **THEN** it records the workspace root path or stable workspace identity when available
- **AND** it records the package or project root path used for the current scope
- **AND** it records a stable project root scope id or equivalent key so sibling packages are not merged accidentally

#### Scenario: Workspace package uses root lockfile versions
- **WHEN** a workspace package has package-local manifests and the workspace has a root lockfile
- **THEN** ExperienceEngine combines package-local dependency signals with root lockfile-resolved versions
- **AND** resolved root lockfile versions take precedence over package manifest ranges for SemVer major-version compatibility

#### Scenario: Fingerprint extraction is tolerant of missing inputs
- **WHEN** a repository lacks package manifests, lockfiles, or recognized config files
- **THEN** ExperienceEngine records unknown or absent signals instead of failing extraction
- **AND** portability scoring treats unknowns as reduced confidence rather than proof of incompatibility

### Requirement: SemVer major-version compatibility
ExperienceEngine SHALL incorporate dependency major-version compatibility into portability scoring.

#### Scenario: Lockfile version wins over package range
- **WHEN** a dependency version exists in both a lockfile and package manifest
- **THEN** ExperienceEngine uses the lockfile-resolved version for major-version compatibility when available
- **AND** it falls back to package manifest semver ranges only when resolved versions are unavailable

#### Scenario: Major-version mismatch reduces portability
- **WHEN** two compatibility fingerprints share a framework, ORM, runtime adapter, build tool, or test tool dependency
- **AND** the dependency major versions differ
- **THEN** ExperienceEngine applies a major-version distance penalty to that dependency's compatibility score
- **AND** framework, ORM, and runtime adapter major mismatches can downgrade the portability band more strongly than test/build tooling mismatches
- **AND** the penalty is visible in portability diagnostics

#### Scenario: Unknown major version reduces certainty
- **WHEN** one or both sides of a shared dependency have unknown major version
- **THEN** ExperienceEngine reduces confidence for that dependency less severely than a known major mismatch
- **AND** it does not treat the unknown as a hard incompatibility by itself

### Requirement: Portability bands govern cross-repo reuse
ExperienceEngine SHALL classify cross-repo candidates into portability bands before delivery decisions.

#### Scenario: Incompatible candidate is skipped
- **WHEN** a cross-repo candidate has strong mismatch, negative evidence, destructive guidance, or explicit repo-local constraints
- **THEN** ExperienceEngine classifies the candidate as incompatible
- **AND** it does not deliver the candidate into prompt text

#### Scenario: Weakly related candidate remains record-only
- **WHEN** a cross-repo candidate has some semantic similarity but insufficient compatibility evidence
- **THEN** ExperienceEngine classifies it as weakly related
- **AND** it may record diagnostic metadata
- **AND** it does not deliver the candidate as prompt guidance

#### Scenario: Same-family candidate is conservative only
- **WHEN** a cross-repo candidate has strong task-family, fingerprint, artifact, and failure-domain compatibility
- **AND** it has no negative evidence
- **THEN** ExperienceEngine may classify it as same-family
- **AND** it may deliver at most conservative guidance according to intervention policy
- **AND** it is not treated as direct eligible delivery solely because of compatibility

#### Scenario: Validated portable candidate requires reuse evidence
- **WHEN** a cross-repo candidate has repeated bounded successful reuse in a compatibility class without causal harm
- **THEN** ExperienceEngine may classify it as validated portable
- **AND** eligible delivery is still subject to guidance risk, intervention policy, and delivery-state gates

### Requirement: Portability evidence is inspectable
ExperienceEngine SHALL expose portability scoring and compatibility reasons to operators.

#### Scenario: Inspection explains cross-repo decision
- **WHEN** a cross-repo candidate is skipped, recorded, delivered conservatively, or classified as validated portable
- **THEN** inspection output includes the portability band, key compatibility signals, SemVer major-version penalties, negative evidence, and delivery reason
- **AND** the explanation does not require scraping prompt text
