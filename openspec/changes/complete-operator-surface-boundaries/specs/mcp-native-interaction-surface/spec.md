## ADDED Requirements

### Requirement: MCP capabilities expose surface tiers

ExperienceEngine MCP capability metadata SHALL expose routine, operator, and advanced or experimental surface groupings.

#### Scenario: Client reads capabilities

- **WHEN** an MCP client reads ExperienceEngine capabilities
- **THEN** the payload SHALL identify routine read surfaces, operator surfaces, and advanced or experimental surfaces
- **AND** it SHALL keep high-risk action metadata distinct from tier metadata

#### Scenario: Operator review appears in capabilities

- **WHEN** capabilities describe operator review, hygiene, or export draft inspection
- **THEN** they SHALL identify those surfaces as operator-tier read-only inspection
- **AND** they SHALL NOT describe them as mutation, export writing, policy restore, or lifecycle-control actions

### Requirement: Broker actions preserve ids while adding surface tier metadata

ExperienceEngine brokered actions SHALL remain compatibility-preserving while exposing clearer surface boundaries.

#### Scenario: Broker lists actions

- **WHEN** a caller lists brokered actions
- **THEN** each action SHALL remain discoverable by its existing id
- **AND** actions SHALL expose or be described with tier information where supported
- **AND** the existing risk-level semantics SHALL remain intact

#### Scenario: Advanced broker action is listed

- **WHEN** brokered maintenance, state, or developer diagnostic actions are listed
- **THEN** ExperienceEngine SHALL label or describe them as operator or advanced as appropriate
- **AND** it SHALL avoid presenting those actions as routine daily-use actions

