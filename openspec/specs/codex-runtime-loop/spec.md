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

### Requirement: Codex uses native lifecycle hooks

ExperienceEngine SHALL integrate with Codex lifecycle events through Codex-native hooks when Codex hooks are available.

#### Scenario: Codex install writes native hook entries

- **WHEN** ExperienceEngine installs or repairs the Codex adapter
- **THEN** it enables the managed `codex_hooks` feature flag
- **AND** writes ExperienceEngine-owned Codex hook entries for supported lifecycle events
- **AND** those hook entries invoke an ExperienceEngine Codex hook command rather than `experienceengine-claude-hook`
- **AND** Codex MCP registration and the managed `AGENTS.md` instruction block remain available as separate Codex host-native surfaces

#### Scenario: Codex UserPromptSubmit injects guidance

- **WHEN** Codex invokes the ExperienceEngine Codex hook for `UserPromptSubmit`
- **AND** ExperienceEngine selects prompt-time guidance for the current task
- **THEN** the hook returns Codex-valid additional context for the turn
- **AND** persists the injected node ids for later outcome attribution

#### Scenario: Codex PostToolUse and Stop support outcome attribution

- **WHEN** Codex invokes ExperienceEngine Codex hooks for tool and stop lifecycle events in the same session
- **THEN** ExperienceEngine persists normalized tool outcomes
- **AND** finalizes the task during `Stop`
- **AND** applies governance writeback using the injected node ids from the turn

#### Scenario: Invalid ExperienceEngine Claude hook drift is detected

- **WHEN** `.codex/hooks.json` contains an ExperienceEngine hook command that references `experienceengine-claude-hook`
- **THEN** `ee doctor codex` reports the project hook state as drifted
- **AND** the diagnostic explains that Claude Code hook protocol is not the valid ExperienceEngine Codex hook entrypoint

### Requirement: Windows Codex wiring uses Windows-accessible commands

ExperienceEngine SHALL use runtime-target-appropriate command paths for Codex hooks and MCP registration.

#### Scenario: Windows runtime target does not register WSL paths for Codex surfaces

- **WHEN** Codex runtime target resolves to `windows`
- **THEN** the hook commands configured for Codex use Windows-accessible launchers
- **AND** the MCP command registered for Codex uses a Windows-accessible launcher
- **AND** the command does not contain `/mnt/<drive>/...` or `/home/...` paths
- **AND** the hook and MCP launcher paths exist after install or repair

#### Scenario: Doctor flags runtime path mismatch

- **WHEN** Codex hook or MCP configuration contains a WSL-style path while the runtime target is `windows`
- **THEN** `ee doctor codex` reports a runtime path mismatch
- **AND** the recommended next step is to run Codex repair rather than manually editing unrelated config

