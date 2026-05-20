## ADDED Requirements

### Requirement: Attribution records include causal trajectory evidence
ExperienceEngine SHALL persist causal trajectory evidence when available for an attribution record.

#### Scenario: Delivered node writes trajectory fields
- **WHEN** a delivered node has trajectory expectations and the finalized task has tool events
- **THEN** ExperienceEngine stores the trajectory verdict, matched expectation references, violated expectation references, tool event evidence references, and trajectory confidence when available
- **AND** the attribution verdict remains separate from the raw trajectory verdict

#### Scenario: Missing trajectory evidence remains unknown
- **WHEN** no reliable trajectory match can be computed
- **THEN** ExperienceEngine records trajectory evidence as unknown or omits trajectory-specific fields
- **AND** it does not infer helped or harmed solely from missing trajectory evidence

### Requirement: Neutral and unknown attribution do not mutate trust counters
ExperienceEngine SHALL avoid helped/harmed counter mutation for neutral or unknown automatic attribution.

#### Scenario: Unrelated failure is neutral
- **WHEN** a delivered intervention is followed by task failure
- **AND** failure attribution is environmental, exploratory, unrelated, or lacks causal linkage to the delivered guidance
- **THEN** ExperienceEngine records neutral or unknown attribution
- **AND** it does not increment `harmed_count` or `consecutive_harmed_count` for that node

#### Scenario: Missing error output is not automatic harm
- **WHEN** a task fails without specific error output or failure signature
- **THEN** ExperienceEngine records unknown or low-confidence attribution unless other evidence proves causal harm
- **AND** it does not mark the node harmed solely because the error output is missing

### Requirement: Causal harm can drive governance evidence
ExperienceEngine SHALL distinguish weak and strong causal harm for lifecycle governance.

#### Scenario: Adopted guidance causes relevant failure
- **WHEN** trajectory evidence shows guidance adoption
- **AND** failed tool events or failure signatures align with the adopted guidance path
- **THEN** ExperienceEngine may record weak or strong harmed attribution with confidence and evidence references
- **AND** lifecycle governance may use that attribution according to quarantine/release policy

#### Scenario: Avoid-step violation is non-adoption by default
- **WHEN** the tool timeline performs an action that delivered guidance instructed the agent to avoid
- **THEN** ExperienceEngine records non-adoption or contra-adoption evidence by default
- **AND** it does not record harmed attribution unless additional evidence shows the guidance itself caused the failure

### Requirement: Manual feedback remains an override
ExperienceEngine SHALL preserve manual helped/harmed feedback as an override over automatic attribution.

#### Scenario: Manual override is visible with causal evidence
- **WHEN** a user marks guidance helped or harmed after automatic trajectory attribution exists
- **THEN** ExperienceEngine preserves the manual feedback behavior
- **AND** attribution inspection shows both the automatic causal evidence and the manual override marker
