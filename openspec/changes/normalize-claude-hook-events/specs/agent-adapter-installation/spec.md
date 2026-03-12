## MODIFIED Requirements

### Requirement: Claude Code foundation captures official hook payloads

ExperienceEngine MUST persist a stable normalized event representation in addition to raw Claude Code hook payloads.

#### Scenario: Claude hook payload is captured

- **WHEN** ExperienceEngine receives a Claude hook payload
- **THEN** it preserves the raw payload capture
- **AND** it appends a normalized Claude adapter event record under the adapter state directory
- **AND** missing host fields do not cause the hook command to fail
