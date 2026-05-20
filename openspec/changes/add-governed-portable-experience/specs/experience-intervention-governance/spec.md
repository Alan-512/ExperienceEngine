## ADDED Requirements

### Requirement: Cross-repo delivery is progressive
ExperienceEngine SHALL govern cross-repo experience delivery through progressive portability bands.

#### Scenario: Same-family cross-repo guidance is conservative
- **WHEN** a cross-repo candidate is classified as same-family by portability governance
- **AND** it has no negative evidence or disallowed risk class
- **THEN** ExperienceEngine may deliver it only as conservative guidance
- **AND** it does not deliver as normal eligible guidance solely because the tech stack is similar

#### Scenario: Validated portable guidance remains risk gated
- **WHEN** a cross-repo candidate is classified as validated portable
- **THEN** ExperienceEngine still applies delivery state, intervention strength, destructive-risk, repo-policy, and confidence gates before prompt delivery
- **AND** risky guidance remains conservative or skipped even when validated portable

#### Scenario: Incompatible cross-repo guidance is skipped
- **WHEN** portability governance classifies a cross-repo candidate as incompatible
- **THEN** ExperienceEngine does not inject it
- **AND** the decision diagnostics include the incompatibility reason

### Requirement: Cross-repo validation evidence is bounded
ExperienceEngine SHALL require bounded positive reuse evidence before treating cross-repo guidance as validated portable.

#### Scenario: Conservative reuse can build portable validation
- **WHEN** a cross-repo conservative intervention is delivered
- **AND** later attribution records show successful bounded reuse without causal harm in the target compatibility class
- **THEN** ExperienceEngine may increase portable validation evidence for that node and compatibility class
- **AND** the validation evidence is inspectable

#### Scenario: Causal harm blocks portable validation
- **WHEN** a cross-repo intervention receives weak or strong causal harm
- **THEN** ExperienceEngine does not count that run as positive portable validation
- **AND** strong causal harm can downgrade, quarantine, or block further cross-repo delivery according to governance policy

### Requirement: Shadow-probe nodes remain delivery suppressed
ExperienceEngine SHALL handle quarantine-release shadow probes without bypassing normal prompt-delivery gates.

#### Scenario: Shadow probe is evaluated but not normally injected
- **WHEN** a quarantined node enters shadow-probe release
- **THEN** ExperienceEngine may evaluate it for diagnostic attribution
- **AND** it does not inject the node as normal prompt guidance
- **AND** decision diagnostics identify the shadow-probe reason

#### Scenario: Shadow probe records withheld no-harm evidence
- **WHEN** a shadow-probe node would match the task or failure domain but is withheld from prompt delivery
- **AND** the finalized task does not reproduce the node's historical harm pattern
- **THEN** ExperienceEngine may record a no-harm probe pass for release governance
- **AND** it does not record recommended-step adoption for guidance the agent never received

#### Scenario: Conservative restoration controls prompt delivery
- **WHEN** a shadow-probe node receives sufficient no-harm release evidence
- **THEN** ExperienceEngine may restore conservative delivery
- **AND** eligible delivery remains blocked until later ordinary validation criteria are met
