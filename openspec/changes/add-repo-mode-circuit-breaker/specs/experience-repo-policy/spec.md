## ADDED Requirements

### Requirement: Repo experience mode controls diagnostic aggressiveness

ExperienceEngine SHALL support repo-level experience modes that tune live diagnostic candidate delivery without replacing existing delivery-state semantics.

#### Scenario: Safe mode uses the default diagnostic gate

- **WHEN** a repo policy is in `safe` mode
- **THEN** ExperienceEngine applies the Phase 3 diagnostic candidate gate as the default behavior
- **AND** existing delivery-state, lifecycle, and second-opinion gates still apply

#### Scenario: Fast learning mode never bypasses hard safety gates

- **WHEN** a repo policy is in `fast_learning` mode
- **THEN** ExperienceEngine may use slightly lower diagnostic match thresholds
- **AND** it still does not deliver cross-scope, harmed, negative-evidence, destructive, retired, quarantined, or disabled-scope candidates

#### Scenario: Strict mode tightens diagnostic delivery

- **WHEN** a repo policy is in `strict` mode
- **THEN** ExperienceEngine requires the highest-confidence diagnostic trigger match before live diagnostic delivery
- **AND** it may suppress live diagnostic candidates while still allowing record-only diagnostic evaluation

### Requirement: Circuit breaker downgrades noisy repo policy

ExperienceEngine SHALL compute circuit breaker state from recent attribution evidence and injection-event fallback data.

#### Scenario: Harmful evidence downgrades fast learning

- **WHEN** recent attribution or fallback injection evidence exceeds the harmful intervention threshold for a repo
- **AND** the current repo mode is `fast_learning`
- **THEN** ExperienceEngine downgrades the effective mode to `safe`
- **AND** records circuit state, reason, and timestamp for inspection

#### Scenario: Repeated harmful evidence downgrades safe mode

- **WHEN** recent attribution or fallback injection evidence exceeds the threshold while the repo is already in `safe`
- **THEN** ExperienceEngine downgrades the effective mode to `strict`
- **AND** records circuit state, reason, and timestamp for inspection

#### Scenario: Strict mode can temporarily disable live diagnostics

- **WHEN** the repo is in `strict` mode and the circuit breaker remains tripped
- **THEN** ExperienceEngine suppresses live diagnostic candidate delivery
- **AND** record-only diagnostic evaluation may continue
- **AND** existing non-diagnostic conservative injections remain governed by their current gates

### Requirement: Repo policy is inspectable and restorable

ExperienceEngine SHALL expose repo policy state and allow explicit manual restore.

#### Scenario: Operator inspects repo policy

- **WHEN** an operator inspects repo summary or configuration
- **THEN** ExperienceEngine reports configured mode, effective mode, circuit state, reason, and last changed time

#### Scenario: Operator restores repo policy

- **WHEN** an operator manually restores repo policy after investigation
- **THEN** ExperienceEngine clears the temporary circuit state
- **AND** returns effective behavior to the configured repo mode
- **AND** keeps attribution and injection history intact

### Requirement: Existing hard safety controls remain authoritative

ExperienceEngine SHALL keep existing disabled scope and lifecycle safety controls stronger than repo mode.

#### Scenario: Disabled scope remains disabled in every mode

- **WHEN** a scope is disabled
- **THEN** ExperienceEngine does not deliver live guidance for that scope regardless of repo experience mode
- **AND** repo mode does not re-enable disabled or quarantined candidates
