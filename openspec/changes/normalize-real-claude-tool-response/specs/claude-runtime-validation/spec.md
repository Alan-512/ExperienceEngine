## ADDED Requirements

### Requirement: Claude Tool Sessions Preserve Real Tool Output

ExperienceEngine MUST normalize real Claude `PostToolUse` payloads so the replayed core runtime preserves actual tool evidence.

#### Scenario: PostToolUse payload includes tool_response stdout

- **WHEN** Claude emits a `PostToolUse` hook payload with `tool_response.stdout`
- **THEN** the Claude adapter normalizes that stdout into `toolOutputSummary`
- **AND** the replayed `experience_input_records.evidence_json` includes the real tool output

#### Scenario: PostToolUse payload omits explicit status

- **WHEN** Claude emits a `PostToolUse` payload with `tool_response.interrupted = false`
- **AND** no explicit `status` field is present
- **THEN** the Claude adapter infers a successful tool result

#### Scenario: PostToolUse payload reports interrupted execution

- **WHEN** Claude emits a `PostToolUse` payload with `tool_response.interrupted = true`
- **THEN** the Claude adapter infers a failed tool result
