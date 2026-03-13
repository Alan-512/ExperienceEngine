## MODIFIED Requirements

### Requirement: Host adapters converge on a unified MCP-primary interaction contract

ExperienceEngine SHALL expose the same MCP-primary interaction contract across hosts where host capabilities allow it.

#### Scenario: Claude Code reuses the shared ExperienceEngine MCP server

- **WHEN** Claude Code needs ExperienceEngine interaction features such as inspect, prompts, or low-risk control tools
- **THEN** it reuses the shared ExperienceEngine MCP server contract
- **AND** it does not require a Claude-specific duplicate interaction server
