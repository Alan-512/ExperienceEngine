## ADDED Requirements

### Requirement: Quarantine leases
ExperienceEngine SHALL support leased quarantine metadata for nodes that may be eligible for later shadow probing.

#### Scenario: Quarantined node records lease metadata
- **WHEN** lifecycle governance quarantines a node for causal harm or repeated weak harm
- **THEN** ExperienceEngine may record quarantine lease expiry, original state before quarantine, release attempt count, quarantine reason, and timestamps
- **AND** it preserves historical helped and harmed counts

#### Scenario: Lease does not weaken active quarantine
- **WHEN** a node is quarantined and its lease has not expired
- **THEN** ExperienceEngine keeps the node out of live prompt delivery
- **AND** it does not treat the node as conservative or eligible solely because a lease exists

### Requirement: Shadow-probe release
ExperienceEngine SHALL release expired quarantine leases into a shadow-probe state before restoring live delivery.

#### Scenario: Expired lease enters shadow probe
- **WHEN** a quarantined node has an expired quarantine lease
- **AND** policy allows automatic release attempts for the scope
- **THEN** ExperienceEngine may move the node into a shadow-probe delivery path
- **AND** the node is not restored directly to eligible delivery
- **AND** the release attempt is recorded

#### Scenario: Shadow probe keeps prompt delivery suppressed
- **WHEN** a node is in shadow probe
- **THEN** ExperienceEngine may evaluate it for diagnostics and attribution
- **AND** it does not inject the node as normal prompt guidance until restoration rules promote it

### Requirement: Conservative restoration
ExperienceEngine SHALL restore quarantined guidance conservatively only after bounded no-harm probe evidence.

#### Scenario: No-harm probe restores conservative delivery
- **WHEN** a shadow-probe node matches a task or failure domain where it would previously have been considered
- **AND** ExperienceEngine withholds the node from prompt delivery
- **AND** the finalized task does not reproduce the node's historical harm pattern
- **AND** the node accumulates the configured number of no-harm passes
- **THEN** ExperienceEngine may restore the node to conservative delivery
- **AND** it preserves historical helped/harmed counts and quarantine history
- **AND** it does not restore direct eligible delivery in the same step

#### Scenario: Hidden recommended steps are not treated as adopted
- **WHEN** a node is in shadow probe and is not injected into prompt guidance
- **THEN** ExperienceEngine does not require or infer adoption of that node's `recommended_steps` for release
- **AND** release evidence is based on withheld-match diagnostics, absence of similar harm, explicit policy-approved override, or later conservative delivery evidence

#### Scenario: Eligible delivery requires later validation
- **WHEN** a previously quarantined node has been restored to conservative delivery
- **THEN** ExperienceEngine requires later validated reuse and ordinary intervention governance before eligible delivery

### Requirement: Repeated causal harm can retire released nodes
ExperienceEngine SHALL retire nodes that demonstrate causal harm after release.

#### Scenario: Similar harm during probe retires node
- **WHEN** a shadow-probe node matches a task or failure domain
- **AND** the finalized task reproduces a failure pattern similar to the node's historical harm pattern
- **THEN** ExperienceEngine retires or keeps quarantined the node according to lifecycle policy
- **AND** it records the causal harm and release attempt evidence

#### Scenario: Repeated harm after conservative restoration retires node
- **WHEN** a previously released node accumulates repeated causal harm after conservative restoration
- **THEN** ExperienceEngine retires or requarantines the node according to lifecycle thresholds
- **AND** it does not erase prior release history

### Requirement: Quarantine release is inspectable
ExperienceEngine SHALL expose quarantine lease and release-probe status through inspection.

#### Scenario: Node inspection shows release state
- **WHEN** an operator inspects a quarantined, shadow-probe, or released node
- **THEN** ExperienceEngine shows quarantine reason, lease expiry, release attempts, current probe/restoration state, and latest release evidence when available
