## ADDED Requirements

### Requirement: MCP exposes autonomous governance state
ExperienceEngine SHALL expose autonomous hygiene governance state through MCP resources or brokered actions for host-native interaction.

#### Scenario: Host requests governance status
- **WHEN** an MCP-capable host requests autonomous governance status for the current scope
- **THEN** ExperienceEngine returns structured schedule, run, recent action, guarded action, failure, and legacy pending approval summaries
- **AND** the status read does not mutate governance state

#### Scenario: Host requests legacy pending approvals
- **WHEN** an MCP-capable host requests pending autonomous governance approvals
- **THEN** ExperienceEngine returns bounded approval items with affected ids, plan rationale, risk level, validator notes, and proposed mutation type
- **AND** it omits raw LLM prompts or secrets from the payload

### Requirement: MCP supports legacy governance approvals through plan-confirm
ExperienceEngine SHALL support explicit host-native approval or rejection for legacy queued governance approval records through the existing high-impact plan-confirm safety model.

#### Scenario: Host plans a legacy queued governance approval
- **WHEN** an MCP-capable host requests approval planning for a legacy queued governance action
- **THEN** ExperienceEngine returns a structured approval plan with scope id, plan id, action id, affected row versions or hashes, diff summary, expiration time, and confirmation token
- **AND** it does not apply the action during planning

#### Scenario: User approves a legacy queued action through the host
- **WHEN** an MCP-capable host submits an explicit approval with a valid confirmation token for a legacy queued governance action
- **THEN** ExperienceEngine validates that the token, action state, scope, affected rows, and validator rules are still current
- **AND** it applies the action through the same transaction, snapshot, audit, and rollback path as other governance mutations

#### Scenario: Host attempts approval without a valid plan
- **WHEN** an MCP-capable host submits approval without a valid fresh confirmation token
- **THEN** ExperienceEngine rejects the approval
- **AND** it instructs the host to obtain a fresh approval plan

#### Scenario: User rejects a legacy queued action through the host
- **WHEN** an MCP-capable host submits an explicit rejection for a legacy queued governance action
- **THEN** ExperienceEngine records the rejection decision and does not apply the action
- **AND** future planning for the same unchanged finding set accounts for the rejection

#### Scenario: Concurrent approval requests race
- **WHEN** multiple hosts submit approval or rejection for the same queued governance action
- **THEN** ExperienceEngine performs an atomic state transition from `pending` to `applying`, `applied`, or `rejected`
- **AND** duplicate submissions return the final recorded action state without applying the action twice

#### Scenario: Affected rows changed before approval execution
- **WHEN** affected row versions or hashes no longer match the approval plan
- **THEN** ExperienceEngine rejects execution of the stale approval
- **AND** it marks the action for re-planning
