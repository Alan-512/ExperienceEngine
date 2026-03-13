## MODIFIED Requirements

### Requirement: ExperienceEngine provides a unified adapter installation surface
ExperienceEngine SHALL expose one product-level installer interface while allowing host-specific adapter mechanics underneath.

#### Scenario: Unified installation command
- **WHEN** a user installs ExperienceEngine for a supported host
- **THEN** the product surface uses a unified command family such as `ee install <agent>`
- **AND** the host-specific adapter wiring remains encapsulated behind that product command

#### Scenario: Unified day-to-day interaction contract
- **WHEN** ExperienceEngine exposes its long-term user interaction surface across supported hosts
- **THEN** it defines one MCP-native interaction contract for inspection, control, and operational actions
- **AND** each host presents that contract according to its documented capabilities rather than through unrelated host-specific command sets
