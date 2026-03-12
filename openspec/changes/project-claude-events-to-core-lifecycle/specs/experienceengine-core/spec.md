## MODIFIED Requirements

### Requirement: The system exposes host-agnostic lifecycle objects

Supported adapters MUST project their normalized host events into the common lifecycle contract used by the core runtime.

#### Scenario: Claude normalized events feed the common lifecycle

- **WHEN** the Claude adapter receives normalized prompt, tool, and session-end events
- **THEN** it can derive `HostPromptContext` and `HostToolResult` objects without re-parsing raw Claude payloads
- **AND** session-end projection reuses the latest prompt context remembered for that session
