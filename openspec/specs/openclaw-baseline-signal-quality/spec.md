# openclaw-baseline-signal-quality Specification

## Purpose
Define signal-quality requirements for OpenClaw baseline evaluations so task classification reflects user intent rather than incidental command text.

## Requirements

### Requirement: Command text does not dominate task classification
ExperienceEngine MUST classify baseline tasks from human-readable task intent instead of from shell command tokens embedded in inline code spans.

#### Scenario: Repo sanity prompt remains general
- **WHEN** an OpenClaw baseline prompt contains inline commands such as ``test -f package.json`` inside backticks
- **AND** the surrounding narrative is a repo sanity or verification task
- **THEN** ExperienceEngine MUST NOT classify the task as `test_debug` solely because of the inline command text

#### Scenario: Narrative debug intent still classifies specialized tasks
- **WHEN** an OpenClaw baseline prompt explicitly describes a test or build debugging task in natural language
- **THEN** ExperienceEngine MUST still classify the task into the matching specialized family even if inline command spans are stripped before matching
