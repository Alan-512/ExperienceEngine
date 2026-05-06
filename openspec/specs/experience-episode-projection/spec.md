# experience-episode-projection Specification

## Purpose
Define a compatibility projection that groups task evidence by episode id while preserving existing table ownership, primary keys, and fallback reads for older data.
## Requirements
### Requirement: New task evidence can be grouped by episode id

ExperienceEngine SHALL assign a compatible `episode_id` to new task evidence rows without replacing existing table keys.

#### Scenario: New task writes share an episode id

- **WHEN** ExperienceEngine records a new task run and its related input, outcome, injection, attribution, and review evidence
- **THEN** compatible rows share the same `episode_id`
- **AND** the existing primary keys and foreign keys remain valid
- **AND** existing write repositories keep their current ownership

#### Scenario: Episode id is nullable for old data

- **WHEN** ExperienceEngine opens a database containing rows created before episode ids existed
- **THEN** those rows remain readable
- **AND** missing `episode_id` values do not break existing inspection, learning, or feedback flows

### Requirement: Episode projection reconstructs a host task

ExperienceEngine SHALL provide a read projection that returns the evidence associated with one episode.

#### Scenario: Projection returns related task evidence

- **WHEN** a caller requests an episode by `episode_id`
- **THEN** ExperienceEngine returns the task run, experience input records, outcome records, injection events, attribution records, and review events associated with that episode when present
- **AND** the projection does not write or mutate those records

#### Scenario: Recent episodes can be listed by scope

- **WHEN** a caller requests recent episodes for a scope
- **THEN** ExperienceEngine returns recent episode summaries grouped by episode id
- **AND** rows without episode ids do not cause the query to fail

### Requirement: Projection-aware surfaces preserve fallback behavior

ExperienceEngine SHALL use episode projection where available while preserving old read paths.

#### Scenario: Inspection uses projection for new data

- **WHEN** the latest task has an `episode_id`
- **THEN** inspection can show grouped task, injection, outcome, review, and attribution evidence from the episode projection

#### Scenario: Inspection falls back for old data

- **WHEN** the latest task does not have an `episode_id`
- **THEN** inspection continues to use the existing table-specific reads
- **AND** user-visible output remains source-compatible
