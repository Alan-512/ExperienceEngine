## ADDED Requirements

### Requirement: MCP inspection resources expose structured Quality Band explanations

ExperienceEngine MCP inspection resources SHALL expose Quality Band explanations as structured payloads for agent consumption.

#### Scenario: Node resource includes Quality Band explanation

- **WHEN** an MCP client reads a node inspection resource or brokered node inspect action
- **THEN** the payload SHALL include the Quality Band explanation fields derived by the shared model
- **AND** the client SHALL NOT need to parse terminal output to recover band reasons

#### Scenario: Last-intervention resource includes Quality Band context

- **WHEN** an MCP client reads the latest intervention or no-injection explanation
- **THEN** the payload SHALL include Quality Band context when matched node or candidate evidence is available
- **AND** it SHALL omit Quality Band context when no relevant learned guidance exists

#### Scenario: Capabilities describe Quality Band as explanatory

- **WHEN** ExperienceEngine lists MCP capabilities
- **THEN** capability metadata SHALL describe Quality Band as a derived inspection explanation
- **AND** it SHALL NOT describe Quality Band as a lifecycle state, delivery gate, or mutation workflow

