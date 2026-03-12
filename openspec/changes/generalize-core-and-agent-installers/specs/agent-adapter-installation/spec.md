## ADDED Requirements

### Requirement: Unified Agent Installation
The system SHALL provide a unified installation entrypoint for supported agent hosts.

#### Scenario: User installs a supported host through one command surface
- **WHEN** a user runs `ee install <agent>`
- **THEN** ExperienceEngine performs the host-specific installation flow for that agent
- **AND** the user does not need a different top-level installer per supported host

#### Scenario: One command surface does not imply one shared install mechanism
- **WHEN** two supported hosts require different integration mechanics
- **THEN** ExperienceEngine may write different kinds of host configuration for each host
- **AND** the `ee install <agent>` contract remains stable for the user

### Requirement: Adapter Strategy Declaration
The system SHALL define the adapter mode used for each supported host.

#### Scenario: OpenClaw remains a native adapter
- **WHEN** ExperienceEngine targets OpenClaw
- **THEN** it uses a native plugin adapter based on the host's supported plugin lifecycle

#### Scenario: Claude Code uses official hooks plus MCP
- **WHEN** ExperienceEngine targets Claude Code in phase one
- **THEN** it uses the host's officially documented hooks as its primary lifecycle integration surface
- **AND** it may use MCP where needed for local integration and installation

#### Scenario: Codex uses documented MCP and an explicit fallback for lifecycle capture
- **WHEN** ExperienceEngine targets Codex in phase one
- **THEN** it uses the host's officially documented MCP integration surface
- **AND** any additional lifecycle wrapper or harness behavior is treated as an explicit fallback rather than as an assumed host-native hook API

### Requirement: Phase-One Implementation Clarity
The system SHALL distinguish between currently implemented adapters and planned adapters described by this change.

#### Scenario: OpenClaw is the only shipping adapter at change time
- **WHEN** this change is reviewed at the time it is introduced
- **THEN** OpenClaw is the only adapter already implemented in the repository
- **AND** Claude Code and Codex remain planned follow-on adapters under the same product contract

### Requirement: Documented Surface Discipline
The system SHALL distinguish documented host integration surfaces from inferred fallback mechanics in adapter planning.

#### Scenario: A host only documents MCP
- **WHEN** a supported host officially documents MCP but does not officially document lifecycle hooks
- **THEN** the adapter plan does not claim native lifecycle hook support for that host
- **AND** any wrapper or harness capture is documented as a fallback owned by ExperienceEngine rather than by the host

#### Scenario: A host documents hooks and MCP
- **WHEN** a supported host officially documents both hooks and MCP
- **THEN** the adapter plan prefers those documented surfaces before introducing wrapper-only integration

### Requirement: Unified Data Home
The system SHALL support a product-owned local data home that is not scoped to one host's private directory.

#### Scenario: Multiple adapters share one product-owned storage root
- **WHEN** ExperienceEngine is installed for more than one supported host
- **THEN** the adapters can use a common product-owned data root with host-specific subdirectories as needed
