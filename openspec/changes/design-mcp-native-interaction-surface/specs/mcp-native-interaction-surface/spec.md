## ADDED Requirements

### Requirement: ExperienceEngine uses MCP as its primary day-to-day interaction surface
ExperienceEngine SHALL define its long-term user interaction model around MCP rather than around standalone CLI commands.

#### Scenario: User inspects ExperienceEngine inside an agent session
- **WHEN** a user asks an agent to inspect ExperienceEngine state or recent behavior
- **THEN** the preferred interaction path is through ExperienceEngine MCP surfaces
- **AND** the standalone CLI remains available as a fallback path

### Requirement: ExperienceEngine separates Resources, Prompts, and Tools
ExperienceEngine SHALL expose different interaction categories through MCP according to their semantics.

#### Scenario: Read-only state is exposed as a resource
- **WHEN** ExperienceEngine exposes recent records or node inventories
- **THEN** those read-only views are modeled as MCP resources rather than mutation tools

#### Scenario: User-controlled workflow entry is exposed as a prompt
- **WHEN** ExperienceEngine exposes reusable review or management entry points
- **THEN** those entry points are modeled as MCP prompts when the host supports them

#### Scenario: Executable actions are exposed as tools
- **WHEN** ExperienceEngine exposes feedback, control, or operational actions
- **THEN** those actions are modeled as MCP tools

### Requirement: ExperienceEngine MCP actions are risk-tiered
ExperienceEngine SHALL classify MCP actions by risk so that high-impact operations are not treated the same as read-only inspection.

#### Scenario: Read-only MCP actions require no special confirmation
- **WHEN** an ExperienceEngine MCP action only reads state
- **THEN** it is classified as a read-only action

#### Scenario: High-impact MCP actions require stronger safeguards
- **WHEN** an ExperienceEngine MCP action changes installation, repair, upgrade, import, or rollback state
- **THEN** it is classified as high-impact
- **AND** the design requires explicit confirmation and a planning or dry-run step before execution
