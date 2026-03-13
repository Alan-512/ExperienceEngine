## MODIFIED Requirements

### Requirement: ExperienceEngine separates Resources, Prompts, and Tools
ExperienceEngine SHALL expose different interaction categories through MCP according to their semantics.

#### Scenario: The first MCP inspect surface is exposed as resources
- **WHEN** ExperienceEngine exposes last-turn, recent-turn, or node inventory inspection views
- **THEN** those views are served as MCP resources
- **AND** the resource payloads are structured so agents can consume them without scraping terminal output

#### Scenario: The first low-risk control surface is exposed as tools
- **WHEN** ExperienceEngine exposes feedback or scope enable/disable actions
- **THEN** those actions are served as MCP tools
- **AND** the tool outputs include structured results in addition to readable text
