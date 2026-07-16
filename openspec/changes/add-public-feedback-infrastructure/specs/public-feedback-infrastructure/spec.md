## ADDED Requirements

### Requirement: Public issue templates request reviewed diagnostics only

ExperienceEngine SHALL provide issue templates for installation problems, runtime bugs, harmful interventions, and feature requests.

#### Scenario: User reports installation or runtime failure

- **WHEN** the issue template requests diagnostic evidence
- **THEN** it SHALL request the user-reviewed manifest or archive
- **AND** it SHALL tell the user not to attach raw databases, settings, credential-bearing logs, prompts, source code, or provider payloads

#### Scenario: User reports harmful intervention

- **WHEN** a harmful-intervention issue is opened
- **THEN** the template SHALL request bounded reproduction context and reviewed diagnostics
- **AND** it SHALL not require the original prompt, repository, source code, or raw model response

#### Scenario: User requests a feature

- **WHEN** a feature request is opened
- **THEN** diagnostic evidence SHALL be optional

### Requirement: Security guidance uses private disclosure

ExperienceEngine SHALL publish a root security policy that directs suspected vulnerabilities or secret exposure away from public issues.

#### Scenario: Security-sensitive report is prepared

- **WHEN** the report concerns a vulnerability, credential exposure, or privacy leak
- **THEN** the policy SHALL direct the user to the private disclosure channel
- **AND** it SHALL warn against attaching diagnostic archives publicly before review

### Requirement: Contribution guidance preserves diagnostic privacy

ExperienceEngine SHALL publish contribution guidance that explains safe reproduction fixtures and diagnostic boundaries.

#### Scenario: Contributor adds a diagnostic fixture

- **WHEN** a test or issue reproduction is contributed
- **THEN** it SHALL use synthetic/sanitized data
- **AND** raw user databases, prompts, repositories, credentials, and provider payloads SHALL be prohibited

### Requirement: Public documentation describes local-only workflow accurately

ExperienceEngine SHALL document diagnostic preparation and archive as user-controlled local operations.

#### Scenario: User reads public setup or troubleshooting docs

- **WHEN** diagnose commands are described
- **THEN** the docs SHALL state that no upload or issue submission occurs automatically
- **AND** support claims SHALL distinguish source, local-pack, and published-package evidence
