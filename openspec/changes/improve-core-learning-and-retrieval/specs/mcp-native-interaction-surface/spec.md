## ADDED Requirements

### Requirement: MCP inspection surfaces expose node explainability
ExperienceEngine SHALL expose richer node provenance and attribution details through its MCP-native inspection surfaces once the core engine persists that data.

#### Scenario: Node resource includes provenance fields
- **WHEN** an MCP client reads an individual ExperienceEngine node resource
- **THEN** the payload includes available provenance and attribution fields for that node
- **AND** the payload remains structured for agent consumption

#### Scenario: Last-intervention inspection can reference attributed records
- **WHEN** an MCP client inspects the latest ExperienceEngine intervention
- **THEN** the response can identify the originating record and attributed node details when available

### Requirement: MCP surfaces support manual experience authoring workflows
ExperienceEngine SHALL support user-authored experience through MCP-native workflows once the underlying authoring path is implemented.

#### Scenario: MCP prompt guides a user-authored experience workflow
- **WHEN** an MCP client requests a manual experience authoring workflow
- **THEN** ExperienceEngine exposes a prompt that guides the agent through collecting the required authored experience fields

#### Scenario: MCP tool persists a user-authored experience node
- **WHEN** an MCP client executes the supported manual experience authoring tool with valid content
- **THEN** ExperienceEngine persists a user-authored node
- **AND** the tool response confirms the created node id and provenance
