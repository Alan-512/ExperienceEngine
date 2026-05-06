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

#### Scenario: User inspects operator review flow

- **WHEN** a user runs `ee inspect review`
- **THEN** ExperienceEngine prints a bounded read-only operator review report with repo policy, hygiene, and export-draft summary sections
- **AND** optional filters such as cwd/scope and limit narrow the report without mutating stored state

#### Scenario: Operator review output is actionable

- **WHEN** a user runs `ee inspect review`
- **THEN** the CLI output includes repo policy health, hygiene count, export draft count, recommended review order, prioritized review items, and review-only next actions
- **AND** each displayed review item includes a drill-down command for the detailed read-only inspection surface
- **AND** the output states that review inspection does not mutate repo policy, nodes, candidates, attribution, review, snapshot, or instruction-file state

### Requirement: Codex diagnostics distinguish MCP, wrapper, and hook surfaces

ExperienceEngine CLI diagnostics SHALL distinguish Codex MCP wiring, Codex CLI wrapper lifecycle, and Codex-native hook lifecycle wiring.

#### Scenario: Doctor reports separate Codex surfaces

- **WHEN** an operator runs `ee doctor codex`
- **THEN** the output reports Codex MCP registration state separately from CLI fallback availability
- **AND** reports `codex_hooks` feature state and Codex project hook state separately from both
- **AND** does not imply that a working MCP registration means project hooks are healthy

#### Scenario: Doctor gives actionable guidance for hook failures

- **WHEN** Codex hook drift is detected
- **THEN** doctor output identifies the invalid hook command
- **AND** recommends `ee repair codex`
- **AND** explains that `ee codex exec` remains the deterministic lifecycle fallback

#### Scenario: Doctor reports disabled Codex hooks

- **WHEN** Codex hook entries are present but `codex_hooks` is disabled or missing
- **THEN** doctor output reports the hook feature as disabled
- **AND** recommends `ee repair codex`
- **AND** does not report hooks as healthy solely because hook files exist

#### Scenario: Repair output lists concrete Codex changes

- **WHEN** `ee repair codex` changes Codex configuration
- **THEN** the output lists whether MCP registration was refreshed
- **AND** lists whether `codex_hooks` was enabled
- **AND** lists whether Codex-native hooks were installed or refreshed
- **AND** lists whether invalid project hooks were removed
- **AND** lists whether managed instructions were updated

