## ADDED Requirements

### Requirement: OpenClaw high-confidence scenario packs are defined and repeatable
ExperienceEngine SHALL provide a built-in OpenClaw scenario pack for high-confidence baseline evaluation that can be rerun after learning-loop changes.

#### Scenario: Built-in high-confidence pack is available
- **WHEN** an operator asks ExperienceEngine to run the OpenClaw high-confidence evaluation pack
- **THEN** the system resolves a built-in `high-confidence` scenario pack
- **AND** that pack contains a stable set of read-only scenarios suitable for repeated baseline comparison

### Requirement: OpenClaw scenario evaluation executes against the real host CLI
ExperienceEngine SHALL run the selected OpenClaw scenario pack through the real `openclaw agent` CLI and persist raw host outputs locally.

#### Scenario: Scenario runner executes real OpenClaw turns
- **WHEN** an operator runs `ee evaluate openclaw-scenarios --pack high-confidence`
- **THEN** ExperienceEngine executes each scenario via `openclaw agent`
- **AND** it stores the raw JSON result for each scenario run in the evaluation artifact directory

### Requirement: Scenario reports join host runs with ExperienceEngine learning records
ExperienceEngine SHALL report scenario outcomes using both raw OpenClaw outputs and persisted learning-loop records.

#### Scenario: Scenario report links session ids to learning-loop objects
- **WHEN** a scenario run completes
- **THEN** the generated report includes the scenario session id
- **AND** it links that session to any matching ExperienceEngine input record, candidate, distillation job, and injected node data available in local persistence

### Requirement: Scenario prompts normalize the repository root explicitly
ExperienceEngine SHALL make the repository root explicit in built-in OpenClaw scenarios so evaluation does not depend on the host's default working directory.

#### Scenario: High-confidence scenarios force repo-root normalization
- **WHEN** ExperienceEngine builds a built-in high-confidence scenario prompt
- **THEN** the prompt explicitly instructs the host to change into the target repository root before executing verification commands
- **AND** the scenario remains read-only with respect to tracked files
