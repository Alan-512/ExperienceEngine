## ADDED Requirements

### Requirement: Current architecture blueprint is maintained

ExperienceEngine SHALL maintain a development architecture blueprint that describes the current code architecture, core data model, module boundaries, and runtime flows.

#### Scenario: Architecture-changing work updates the blueprint

- **WHEN** a change modifies module boundaries, runtime flow, domain objects, storage relationships, host adapter behavior, or operator surfaces that affect architecture
- **THEN** the change SHALL update `docs/development/architecture.md` or explicitly state why no blueprint update is required

### Requirement: Roadmap is separate from current-state documentation

ExperienceEngine SHALL keep future architecture direction separate from the current architecture blueprint.

#### Scenario: Future plan changes

- **WHEN** architecture priorities, phase boundaries, or execution constraints change
- **THEN** the change SHALL update `docs/development/architecture-optimization-roadmap.md` without turning `docs/development/architecture.md` into a proposal document

### Requirement: Development docs expose the architecture update rule

ExperienceEngine SHALL provide a development docs entrypoint that identifies the architecture blueprint and its update rule.

#### Scenario: Agent or maintainer enters development docs

- **WHEN** a coding agent or maintainer opens `docs/development/README.md`
- **THEN** it SHALL identify `architecture.md` as the required current architecture baseline and list the types of changes that must update it
