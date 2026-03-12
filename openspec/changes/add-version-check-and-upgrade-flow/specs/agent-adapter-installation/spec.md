## MODIFIED Requirements

### Requirement: ExperienceEngine exposes per-agent installer entrypoints

`ee install <agent>` MUST support host-specific installation flows without changing the core runtime contract.

#### Scenario: Install Codex MCP foundation

- **WHEN** a user runs `ee install codex`
- **THEN** ExperienceEngine registers its local MCP server with Codex
- **AND** it persists Codex adapter install-state under the shared ExperienceEngine data home
- **AND** it records the current ExperienceEngine package version in that install-state
- **AND** the install only relies on officially documented Codex MCP surfaces

### Requirement: ExperienceEngine exposes host-specific doctor diagnostics

`ee doctor <agent>` MUST report whether the selected host is wired to the ExperienceEngine adapter.

#### Scenario: Inspect Codex MCP foundation

- **WHEN** a user runs `ee doctor codex`
- **THEN** ExperienceEngine reports whether Codex has an `experienceengine` MCP entry
- **AND** it reports the current configured command or config target used by that entry

#### Scenario: Doctor reports adapter version drift

- **WHEN** a user runs `ee doctor <agent>` after updating the local ExperienceEngine package
- **THEN** ExperienceEngine reports the adapter's recorded installed version
- **AND** it reports the current local package version
- **AND** it flags that an upgrade is available when the local package version is newer

### Requirement: ExperienceEngine exposes host-specific upgrade entrypoints

`ee upgrade <agent>` MUST refresh host wiring for the currently running ExperienceEngine package.

#### Scenario: Upgrade reapplies host wiring for the current local package

- **WHEN** a user runs `ee upgrade <agent>`
- **THEN** ExperienceEngine reruns the host-specific install flow for that agent
- **AND** it refreshes install-state with the current package version
- **AND** it prints any host-specific follow-up guidance needed after the upgrade
