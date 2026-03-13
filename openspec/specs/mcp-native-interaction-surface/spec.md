# mcp-native-interaction-surface Specification

## Purpose
Define ExperienceEngine's long-term MCP-native interaction model across resources, prompts, and tools, with clear risk tiering and CLI fallback semantics.

## Requirements

### Requirement: ExperienceEngine uses MCP as its primary day-to-day interaction surface

ExperienceEngine SHALL define its long-term user interaction model around MCP rather than around standalone CLI commands.

#### Scenario: User inspects ExperienceEngine inside an agent session

- **WHEN** a user asks an agent to inspect ExperienceEngine state or recent behavior
- **THEN** the preferred interaction path is through ExperienceEngine MCP surfaces
- **AND** the standalone CLI remains available as a fallback path

#### Scenario: Users can inspect operational state inside an agent session

- **WHEN** a user asks an agent to check ExperienceEngine installation health or update state
- **THEN** ExperienceEngine exposes that read-only operational state through MCP resources or read-only tools
- **AND** the standalone CLI remains available as fallback

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

#### Scenario: The first MCP inspect surface is exposed as resources

- **WHEN** ExperienceEngine exposes last-turn, recent-turn, or node inventory inspection views
- **THEN** those views are served as MCP resources
- **AND** the resource payloads are structured so agents can consume them without scraping terminal output

#### Scenario: The first low-risk control surface is exposed as tools

- **WHEN** ExperienceEngine exposes feedback or scope enable/disable actions
- **THEN** those actions are served as MCP tools
- **AND** the tool outputs include structured results in addition to readable text

#### Scenario: ExperienceEngine exposes review workflows as prompts

- **WHEN** ExperienceEngine offers reusable last-intervention or warning-review workflows
- **THEN** those workflows are exposed as MCP prompts
- **AND** review prompts link to the relevant ExperienceEngine resources when possible

#### Scenario: ExperienceEngine exposes light control workflows as prompts

- **WHEN** ExperienceEngine offers pause/resume or last-feedback workflows
- **THEN** those workflows are exposed as MCP prompts
- **AND** the prompt text instructs the agent to confirm before calling the underlying control tool

### Requirement: ExperienceEngine MCP actions are risk-tiered

ExperienceEngine SHALL classify MCP actions by risk so that high-impact operations are not treated the same as read-only inspection.

#### Scenario: Read-only MCP actions require no special confirmation

- **WHEN** an ExperienceEngine MCP action only reads state
- **THEN** it is classified as a read-only action

#### Scenario: High-impact MCP actions require stronger safeguards

- **WHEN** an ExperienceEngine MCP action changes installation, repair, upgrade, import, or rollback state
- **THEN** it is classified as high-impact
- **AND** the design requires explicit confirmation and a planning or dry-run step before execution

#### Scenario: Medium-risk node lifecycle controls are exposed as explicit tools

- **WHEN** ExperienceEngine exposes node cooling or retirement controls
- **THEN** those actions are exposed as MCP tools
- **AND** they remain distinct from high-impact operational actions such as upgrade or rollback
