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
The system SHALL persist OpenClaw task outcomes into a candidate-first lifecycle and use OpenClaw as the baseline host for core learning validation.

#### Scenario: Successful or failed finalized turn creates candidate-side records first
- **GIVEN** a session with a supported task summary and enough terminal evidence to build learning input
- **WHEN** ExperienceEngine receives a finalize-capable event
- **THEN** it writes the finalized task input and outcome records needed for learning
- **AND** it persists one or more `ExperienceCandidate` records when analyzer thresholds are met
- **AND** it does not require a final `ExperienceNode` to be created synchronously in the finalize path

#### Scenario: OpenClaw remains the baseline host for core learning evaluation
- **GIVEN** ExperienceEngine's multi-host product surface
- **WHEN** candidate creation, async distillation, cold-start behavior, or lifecycle evaluation are validated for the core engine
- **THEN** OpenClaw is treated as the primary baseline host for that validation
- **AND** other hosts may reuse the resulting learning pipeline without redefining the baseline

### Requirement: OpenClaw candidate lifecycle supports asynchronous distillation
The system SHALL preserve enough OpenClaw task evidence to let candidate distillation complete asynchronously after the task has already ended.

#### Scenario: Finalized OpenClaw task queues distillation work
- **WHEN** an OpenClaw task produces a persisted candidate
- **THEN** ExperienceEngine records distillation work for later asynchronous execution
- **AND** the original task finalize flow is not blocked by waiting for final experience wording

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
