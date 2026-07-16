## ADDED Requirements

### Requirement: CLI archives diagnostics only after explicit review

ExperienceEngine SHALL keep archive creation separate from bundle preparation.

#### Scenario: User explicitly archives a review directory

- **WHEN** a user runs `ee diagnose --archive <review-directory>`
- **THEN** the CLI SHALL validate and archive the exact reviewed manifest
- **AND** it SHALL not upload or submit the archive

#### Scenario: User only prepares a bundle

- **WHEN** a user runs `ee diagnose --prepare-bundle`
- **THEN** no archive SHALL be created implicitly
