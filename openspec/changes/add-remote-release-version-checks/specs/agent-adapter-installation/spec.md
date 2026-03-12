## MODIFIED Requirements

### Requirement: ExperienceEngine exposes host-specific doctor diagnostics

`ee doctor <agent>` MUST report whether the selected host is wired to the ExperienceEngine adapter.

#### Scenario: Inspect Codex MCP foundation

- **WHEN** a user runs `ee doctor codex`
- **THEN** ExperienceEngine reports whether Codex has an `experienceengine` MCP entry
- **AND** it reports the current configured command or config target used by that entry

#### Scenario: Doctor reports remote update availability

- **WHEN** a user runs `ee doctor <agent>` on a build that can resolve the ExperienceEngine GitHub repository
- **THEN** ExperienceEngine reports the current local package version
- **AND** it reports the latest remote release version when the GitHub release lookup succeeds
- **AND** it flags that a package update is available when the remote release is newer than the local package

#### Scenario: Doctor degrades gracefully when remote release lookup fails

- **WHEN** a remote release lookup times out, fails, or the repository metadata cannot be resolved to GitHub
- **THEN** `ee doctor` still reports local adapter health
- **AND** it reports remote release status as unavailable or unconfigured instead of failing the command
