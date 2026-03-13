## MODIFIED Requirements

### Requirement: ExperienceEngine separates Resources, Prompts, and Tools
ExperienceEngine SHALL expose different interaction categories through MCP according to their semantics.

#### Scenario: ExperienceEngine exposes review workflows as prompts
- **WHEN** ExperienceEngine offers reusable last-intervention or warning-review workflows
- **THEN** those workflows are exposed as MCP prompts
- **AND** review prompts link to the relevant ExperienceEngine resources when possible

#### Scenario: ExperienceEngine exposes light control workflows as prompts
- **WHEN** ExperienceEngine offers pause/resume or last-feedback workflows
- **THEN** those workflows are exposed as MCP prompts
- **AND** the prompt text instructs the agent to confirm before calling the underlying control tool
