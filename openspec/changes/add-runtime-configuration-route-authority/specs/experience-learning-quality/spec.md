## ADDED Requirements

### Requirement: Production learning quality is capability-specific and profile-bound

ExperienceEngine SHALL derive production learning quality from the selected versioned quality profile and the current validation, benchmark assurance, active route, and runtime health of each required capability.

#### Scenario: Evaluated recommended profile is current

- **WHEN** the exact compatible active packaged registry entry is selected and every required capability has current valid validation, recommended or supported benchmark assurance, and healthy or validated-fallback runtime health
- **THEN** core learning quality MAY project as production
- **AND** the projection SHALL retain capability-specific evidence rather than one global provider status

#### Scenario: Custom profile validates

- **WHEN** a user-selected compatible route passes the required capability contract validation but has no matching benchmark-backed registry assurance
- **THEN** ExperienceEngine SHALL report `Contract valid; quality unbenchmarked`
- **AND** it SHALL NOT relabel the route or generated semantic origin as recommended or supported

#### Scenario: One required capability is stale or missing

- **WHEN** another capability remains valid but a required capability has stale, invalid, or missing validation
- **THEN** the valid capability SHALL NOT make the complete profile production-ready

### Requirement: Provider failure does not create rule-authored production semantic content

ExperienceEngine SHALL keep deterministic rules for admission, validation, safety, skip, merge control, attribution, and governance while prohibiting silent rule-authored semantic substitution after a configured production provider route fails.

#### Scenario: Candidate generation route is unavailable

- **WHEN** a candidate requires model-backed semantic generation and no current validated route or fallback is available
- **THEN** the work SHALL become blocked under the queue failure contract
- **AND** rule analysis SHALL NOT author substitute production candidate text

#### Scenario: Distillation route is unavailable

- **WHEN** a candidate requires final semantic distillation and no current validated route or fallback is available
- **THEN** the work SHALL remain recoverable and blocked without content-retry consumption
- **AND** passthrough or rule-generated text SHALL NOT become a production node

#### Scenario: Explicit legacy rule mode is selected

- **WHEN** an operator explicitly selects a supported compatibility or experimental rule mode outside the production profile
- **THEN** ExperienceEngine MAY preserve that separately labeled behavior
- **AND** it SHALL NOT silently enter that mode from provider failure or report evaluated production quality
