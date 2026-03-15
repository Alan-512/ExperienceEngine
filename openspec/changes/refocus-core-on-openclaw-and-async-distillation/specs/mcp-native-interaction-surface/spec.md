## MODIFIED Requirements

### Requirement: Host adapters converge on a unified MCP-primary interaction contract
ExperienceEngine SHALL expose the same MCP-primary interaction contract across hosts where host capabilities allow it, while keeping OpenClaw as the baseline validation host for the core learning loop.

#### Scenario: Claude Code reuses the shared ExperienceEngine MCP server
- **WHEN** Claude Code needs ExperienceEngine interaction features such as inspect, prompts, or low-risk control tools
- **THEN** it reuses the shared ExperienceEngine MCP server contract
- **AND** it does not require a Claude-specific duplicate interaction server

#### Scenario: Codex reuses the shared MCP interaction contract without becoming the core learning baseline
- **WHEN** Codex needs ExperienceEngine interaction features such as inspect, prompts, or low-risk control tools
- **THEN** it reuses the shared ExperienceEngine MCP server contract
- **AND** its interaction support does not by itself redefine the primary baseline host for core learning validation

## REMOVED Requirements

### Requirement: MCP surfaces support manual experience authoring workflows
**Reason**: 当前阶段移除手工经验补写主入口，避免干扰自动 capture -> distill -> govern 主链的验证。
**Migration**: Remove manual remember MCP prompts and tools from the current shared interaction surface; inspect and governance tools remain supported.
