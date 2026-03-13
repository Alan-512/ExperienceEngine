# codex-runtime-loop Specification

## Purpose
Define the Codex-side ExperienceEngine contract, including:
- real runtime loop validation
- MCP-native interaction surfaces for inspection, control, prompts, and operational reads

## Requirements

### Requirement: Codex behavior loop is validated in a real host run

ExperienceEngine MUST demonstrate that the Codex MCP behavior loop works in a real Codex execution, not only in unit tests.

#### Scenario: Real Codex run updates helped feedback

- **WHEN** a real Codex execution calls the ExperienceEngine MCP tools for a matching task and finalizes with a successful tool result
- **THEN** the finalized input record persists a non-empty `injected_node_ids_json`
- **AND** the injected node's `helped_count` increments

#### Scenario: Real Codex run updates harmed feedback

- **WHEN** a real Codex execution calls the ExperienceEngine MCP tools for a matching task and finalizes with a failed tool result
- **THEN** the finalized input record persists a non-empty `injected_node_ids_json`
- **AND** the injected node's `harmed_count` increments

### Requirement: Codex exposes an ExperienceEngine MCP surface

The Codex adapter SHALL expose ExperienceEngine interaction primitives over MCP in addition to the runtime-loop tools.

#### Scenario: Codex reads the last intervention through an MCP resource

- **WHEN** a Codex MCP client reads `experienceengine://last`
- **THEN** the server returns the most recent persisted ExperienceEngine input record and any resolved injected nodes

#### Scenario: Codex reads recent injected history through an MCP resource

- **WHEN** a Codex MCP client reads `experienceengine://recent/injected/5`
- **THEN** the server returns the most recent injected ExperienceEngine records limited to the requested count

#### Scenario: Codex updates feedback through an MCP tool

- **WHEN** a Codex MCP client calls `experienceengine_feedback_last`
- **THEN** the server updates the latest injected node set with the requested feedback
- **AND** the response confirms which node ids were updated

#### Scenario: Codex toggles scope interventions through an MCP tool

- **WHEN** a Codex MCP client calls `experienceengine_disable_scope` or `experienceengine_enable_scope`
- **THEN** the server updates the resolved scope state for the provided working directory
- **AND** the response includes the resolved scope id and disabled state

#### Scenario: Codex exposes a prompt for reviewing the last intervention

- **WHEN** a Codex MCP client gets the `experienceengine_show_last_intervention` prompt
- **THEN** the prompt payload guides the agent to review the latest ExperienceEngine interaction
- **AND** references the `experienceengine://last` resource

#### Scenario: Codex exposes a prompt for pausing the current project

- **WHEN** a Codex MCP client gets the `experienceengine_pause_current_project` prompt
- **THEN** the prompt payload instructs the agent to confirm with the user
- **AND** then call `experienceengine_disable_scope`

#### Scenario: Codex reads doctor state through MCP

- **WHEN** a Codex MCP client reads `experienceengine://doctor/codex`
- **THEN** the server returns structured Codex adapter inspection state

#### Scenario: Codex checks update state through MCP

- **WHEN** a Codex MCP client calls `experienceengine_check_update` with `adapter=codex`
- **THEN** the server returns the structured remote release status for the current ExperienceEngine package and adapter context

#### Scenario: Codex cools an ExperienceEngine node through MCP

- **WHEN** a Codex MCP client calls `experienceengine_cool_node`
- **THEN** the server updates the target node to the cooling state

#### Scenario: Codex retires an ExperienceEngine node through MCP

- **WHEN** a Codex MCP client calls `experienceengine_retire_node`
- **THEN** the server updates the target node to the retired state
