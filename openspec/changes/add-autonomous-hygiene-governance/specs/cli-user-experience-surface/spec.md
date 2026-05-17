## ADDED Requirements

### Requirement: CLI exposes autonomous governance inspection
ExperienceEngine SHALL expose autonomous hygiene governance status, history, guarded action results, legacy pending approvals, and rollback references through CLI inspection surfaces.

#### Scenario: User inspects governance status
- **WHEN** a user runs a CLI inspection command for autonomous governance
- **THEN** ExperienceEngine prints the scope schedule, last run status, next due time, recent action counts, guarded action count, legacy pending approval count, and failed run count
- **AND** it does not require the user to run that command for routine governance to occur

#### Scenario: User inspects a governance plan
- **WHEN** a user requests a stored governance plan by id
- **THEN** ExperienceEngine prints the plan summary, cluster theme, proposed actions, validator decisions, applied and guarded action ids, legacy pending approval ids, and rollback references

#### Scenario: User requests safe governance drain
- **WHEN** a user explicitly runs a CLI maintenance command to drain due governance
- **THEN** ExperienceEngine uses the same persisted schedule, lease, budget, validator, and audit path as host-attached governance
- **AND** it does not bypass normal safety gates
