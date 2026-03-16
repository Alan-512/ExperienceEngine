## ADDED Requirements

### Requirement: Baseline evaluation produces a structured OpenClaw snapshot
ExperienceEngine SHALL provide a baseline evaluation entrypoint that summarizes current OpenClaw learning-loop state from managed persistence.

#### Scenario: Evaluation summarizes current persisted learning state
- **WHEN** an operator runs the supported OpenClaw baseline evaluation workflow
- **THEN** ExperienceEngine outputs a structured summary covering input records, candidates, distillation jobs, nodes, and feedback signals

### Requirement: Baseline evaluation produces both machine-readable and human-readable outputs
ExperienceEngine SHALL emit baseline snapshots as both JSON and Markdown artifacts.

#### Scenario: Baseline snapshot writes two artifact formats
- **WHEN** ExperienceEngine writes a baseline snapshot
- **THEN** it writes `summary.json`
- **AND** it writes `summary.md`

### Requirement: Baseline artifacts stay local to the operator environment
ExperienceEngine SHALL treat generated baseline snapshots as local operator artifacts rather than repository source documents.

#### Scenario: Generated baseline artifacts write under artifacts/
- **WHEN** ExperienceEngine generates a baseline snapshot without an explicit output directory override
- **THEN** it writes under `artifacts/evaluations/openclaw/<timestamp>/`

### Requirement: OpenClaw remains the baseline host for learning-loop evaluation
ExperienceEngine SHALL treat the OpenClaw baseline evaluation workflow as the primary current-host evaluation path for the learning loop.

#### Scenario: Other hosts do not redefine the baseline workflow
- **WHEN** Claude Code or Codex continue to reuse the same core learning objects
- **THEN** the current baseline evaluation still runs against the OpenClaw host environment
- **AND** other hosts remain regression or reuse checks rather than the primary baseline
