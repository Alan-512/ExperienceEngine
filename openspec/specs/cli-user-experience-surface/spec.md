# cli-user-experience-surface Specification

## Purpose
Define explicit CLI fallback surfaces for inspecting and managing ExperienceEngine when host-native or MCP interaction is unavailable or insufficient.
## Requirements
### Requirement: ExperienceEngine supports on-demand CLI inspection
The product SHALL expose explicit CLI commands for users who want to inspect recent or active experience behavior.

#### Scenario: User inspects the last intervention

- **WHEN** a user runs `ee inspect --last`
- **THEN** ExperienceEngine reports the last session/task context
- **AND** it reports whether intervention happened
- **AND** it reports which nodes were injected, if any

#### Scenario: User inspects active experiences

- **WHEN** a user runs `ee inspect active`
- **THEN** ExperienceEngine lists currently active experience nodes with enough metadata for user review

#### Scenario: User inspects recent history

- **WHEN** a user runs `ee inspect recent`
- **THEN** ExperienceEngine lists recent recorded task summaries and outcomes

#### Scenario: User inspects a specific node

- **WHEN** a user runs `ee inspect node <id>`
- **THEN** ExperienceEngine prints detailed metadata for that node

#### Scenario: User inspects nodes by state

- **WHEN** a user runs `ee inspect state retired`
- **THEN** ExperienceEngine lists only nodes with the requested lifecycle state

#### Scenario: User inspects nodes by type

- **WHEN** a user runs `ee inspect type warning`
- **THEN** ExperienceEngine lists only nodes with the requested node type

#### Scenario: User inspects hygiene findings

- **WHEN** a user runs `ee inspect hygiene`
- **THEN** ExperienceEngine prints a bounded read-only hygiene report with summary counts and findings
- **AND** optional filters such as scope, finding type, severity, and limit narrow the report without mutating stored state

#### Scenario: User inspects export drafts

- **WHEN** a user runs `ee inspect export-drafts`
- **THEN** ExperienceEngine prints bounded read-only guidance export drafts with summary counts and review context
- **AND** optional filters such as scope, node id, node type, task family, lifecycle state, delivery state, risk, and limit narrow the report without mutating stored state

