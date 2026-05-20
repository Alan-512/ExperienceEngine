## ADDED Requirements

### Requirement: Doctor exposes embedding profile readiness
ExperienceEngine CLI diagnostics SHALL expose strict offline embedding profile readiness.

#### Scenario: Doctor reports offline embedding profile
- **WHEN** an operator runs doctor or an equivalent CLI diagnostic for the active workspace
- **THEN** the output reports the active embedding profile type
- **AND** it reports whether strict offline assets are present, checksum-valid, and remote-fetch disabled when applicable
- **AND** it reports whether semantic retrieval is ready, degraded, or blocked

#### Scenario: CLI imports offline asset pack
- **WHEN** an operator runs the offline asset import command with a local asset pack
- **THEN** ExperienceEngine validates the pack manifest and checksums
- **AND** it registers the imported manifest for strict offline profile resolution
- **AND** the command reports success or bounded validation errors without requiring network access

#### Scenario: CLI reports asset registry state
- **WHEN** an operator inspects embedding diagnostics after asset import
- **THEN** the output includes imported manifest identity, checksum status, asset location, and whether the imported assets satisfy the active strict offline profile

#### Scenario: Doctor reports vector migration
- **WHEN** vector migration is pending, running, failed, or completed
- **THEN** doctor output includes bounded migration counts, active target embedding space, and latest error summary when present
- **AND** it recommends the relevant maintenance or repair command when migration is blocked
- **AND** it reports lock contention, busy retry, or throttle status when those conditions are relevant

### Requirement: Inspection exposes portability diagnostics
ExperienceEngine CLI inspection SHALL expose cross-repo portability diagnostics for recent interventions and candidate decisions.

#### Scenario: Inspect last shows portability decision
- **WHEN** an operator runs latest verbose inspection for a task where a cross-repo candidate was considered
- **THEN** the output includes portability band, compatibility fingerprint summary, SemVer major-version penalties, negative evidence, and final delivery decision
- **AND** non-verbose output remains concise

#### Scenario: Inspect node shows portable validation
- **WHEN** an operator inspects a node with portable validation evidence
- **THEN** the output includes compatibility classes, validation counts, latest portable reuse evidence, and blocking risk reasons when present

### Requirement: Inspection exposes causal trajectory attribution
ExperienceEngine CLI inspection SHALL expose trajectory attribution evidence without making default output noisy.

#### Scenario: Verbose attribution shows tool trajectory
- **WHEN** an operator inspects an attribution record or latest task with trajectory evidence
- **THEN** the output includes trajectory verdict, matched or violated expectations, relevant tool event references, and confidence
- **AND** the output distinguishes trajectory verdict from final attribution verdict

### Requirement: Inspection exposes quarantine release state
ExperienceEngine CLI inspection SHALL expose quarantine lease and shadow-probe status.

#### Scenario: Inspect node shows quarantine release metadata
- **WHEN** an operator inspects a quarantined, shadow-probe, or recently released node
- **THEN** the output includes quarantine reason, lease expiry, release attempt count, probe/restoration state, no-harm pass counts, and latest release evidence when available

#### Scenario: Doctor summarizes release candidates
- **WHEN** quarantine release governance is enabled
- **THEN** doctor or review inspection can summarize how many nodes are quarantined, lease-expired, in shadow probe, restored conservatively, or retired after release harm
- **AND** the summary does not mutate node state by itself
