# Capability: OpenClaw Experience Plugin

## Purpose

ExperienceEngine is implemented as an OpenClaw companion plugin that observes task activity,
stores compact experience artifacts, and injects conservative execution hints on later similar turns.

## Requirements

### Requirement: Plugin Registration
The system SHALL expose ExperienceEngine as a standard OpenClaw plugin rather than a ContextEngine slot plugin.

#### Scenario: Plugin metadata is present
- **GIVEN** the repository root
- **WHEN** OpenClaw scans plugin metadata
- **THEN** it finds `openclaw.plugin.json`
- **AND** the plugin declares a stable id, name, version, and config schema

#### Scenario: Runtime registration is available
- **GIVEN** the built plugin entrypoint
- **WHEN** OpenClaw loads the module
- **THEN** the default export provides `register(api)`
- **AND** the plugin can bind lifecycle handlers through the provided API

### Requirement: Host Payload Normalization
The system SHALL normalize supported OpenClaw payload shapes into a usable internal task context.

#### Scenario: Message-object prompt payload
- **GIVEN** a prompt payload containing `session.key`, `workspace.cwd`, and `message.content`
- **WHEN** ExperienceEngine normalizes the payload
- **THEN** it resolves a session id, cwd, user message, and task summary

#### Scenario: Messages-array prompt payload
- **GIVEN** a prompt payload containing `messages[]` and a repo root
- **WHEN** ExperienceEngine normalizes the payload
- **THEN** it resolves the latest user request as the task summary
- **AND** it preserves any available context summary from compaction or working context

#### Scenario: Tool persistence payload
- **GIVEN** a tool result payload with tool identity and execution status
- **WHEN** ExperienceEngine normalizes the payload
- **THEN** it records a tool event with name, status, and optional evidence fields

### Requirement: Experience Persistence
The system SHALL persist minimal experience records after a task finalization signal.

#### Scenario: Successful seed turn creates records
- **GIVEN** a session with a supported task summary and a successful tool result
- **WHEN** ExperienceEngine receives a finalize-capable event
- **THEN** it writes an `experience_input_record`
- **AND** it updates `scope_task_stats`
- **AND** it stores at least one candidate experience node when analyzer thresholds are met

#### Scenario: Unknown outcomes remain conservative
- **GIVEN** a finalized task without enough evidence to infer success or failure
- **WHEN** ExperienceEngine stores the task result
- **THEN** the persisted `outcome_signal` remains `unknown`
- **AND** later logic may treat the record more conservatively

### Requirement: Conservative Hint Injection
The system SHALL inject hints only when a similar prior experience exists and the trigger conditions are met.

#### Scenario: Similar replay turn receives hints
- **GIVEN** a prior successful task that produced an experience node in the same scope and task type
- **WHEN** a later similar task enters `before_prompt_build`
- **THEN** ExperienceEngine prepends a conservative execution hints block
- **AND** the block contains at most the configured maximum number of hints

#### Scenario: No reliable trigger means skip
- **GIVEN** a task with no candidate nodes or no qualifying trigger conditions
- **WHEN** ExperienceEngine evaluates the turn
- **THEN** it leaves the payload unmodified
