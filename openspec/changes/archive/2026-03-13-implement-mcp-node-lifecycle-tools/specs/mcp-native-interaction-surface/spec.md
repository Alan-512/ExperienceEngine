## MODIFIED Requirements

### Requirement: ExperienceEngine MCP actions are risk-tiered
ExperienceEngine SHALL classify MCP actions by risk so that high-impact operations are not treated the same as read-only inspection.

#### Scenario: Medium-risk node lifecycle controls are exposed as explicit tools
- **WHEN** ExperienceEngine exposes node cooling or retirement controls
- **THEN** those actions are exposed as MCP tools
- **AND** they remain distinct from high-impact operational actions such as upgrade or rollback
