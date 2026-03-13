## MODIFIED Requirements

### Requirement: High-impact operational actions are exposed through plan-and-confirm MCP workflows

ExperienceEngine SHALL expose supported high-impact operational actions through MCP only with explicit planning and confirmation semantics.

#### Scenario: Install is planned before execution

- **WHEN** an agent wants to install ExperienceEngine for a supported adapter through MCP
- **THEN** it first obtains a structured install plan
- **AND** the plan includes a confirmation token required for execution

#### Scenario: Repair is blocked without confirmation

- **WHEN** an agent attempts to run a high-impact repair action without a valid prior confirmation token
- **THEN** ExperienceEngine rejects the action
- **AND** instructs the caller to obtain a fresh plan first

#### Scenario: Upgrade execution reuses canonical installer flows

- **WHEN** an agent confirms an upgrade through MCP
- **THEN** ExperienceEngine executes the same upgrade semantics used by the CLI fallback path
