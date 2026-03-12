## ADDED Requirements

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
