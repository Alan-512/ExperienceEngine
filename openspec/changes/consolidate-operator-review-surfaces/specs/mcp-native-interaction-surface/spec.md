## MODIFIED Requirements

### Requirement: ExperienceEngine separates Resources, Prompts, and Tools
ExperienceEngine SHALL expose different interaction categories through MCP according to their semantics.

#### Scenario: Read-only state is exposed as a resource
- **WHEN** ExperienceEngine exposes recent records or node inventories
- **THEN** those read-only views are modeled as MCP resources rather than mutation tools

#### Scenario: User-controlled workflow entry is exposed as a prompt
- **WHEN** ExperienceEngine exposes reusable review or management entry points
- **THEN** those entry points are modeled as MCP prompts when the host supports them

#### Scenario: Executable actions are exposed as tools
- **WHEN** ExperienceEngine exposes feedback, control, or operational actions
- **THEN** those actions are modeled as MCP tools

#### Scenario: The first MCP inspect surface is exposed as resources
- **WHEN** ExperienceEngine exposes last-turn, recent-turn, or node inventory inspection views
- **THEN** those views are served as MCP resources
- **AND** the resource payloads are structured so agents can consume them without scraping terminal output

#### Scenario: Hygiene inspection is exposed as read-only state
- **WHEN** ExperienceEngine exposes hygiene findings through MCP or session interaction surfaces
- **THEN** those findings are exposed as structured read-only state through a resource or read-only action
- **AND** the payload includes summary counts, bounded findings, affected ids, evidence summaries, and review-only recommendations

#### Scenario: Export draft inspection is exposed as read-only state
- **WHEN** ExperienceEngine exposes guidance export drafts through MCP or session interaction surfaces
- **THEN** those drafts are exposed as structured read-only state through a resource or read-only action
- **AND** the payload includes summary counts, bounded drafts, node ids, lifecycle/delivery state, evidence summaries, risk notes, and review-only suggested targets

#### Scenario: Operator review flow is exposed as read-only state
- **WHEN** ExperienceEngine exposes operator review through MCP or session interaction surfaces
- **THEN** the review flow is exposed as structured read-only state through a resource and brokered inspect action
- **AND** the payload includes repo policy, hygiene, export-draft summaries, recommended review order, drill-down references, and review-only next actions

#### Scenario: The first low-risk control surface is exposed as tools
- **WHEN** ExperienceEngine exposes feedback or scope enable/disable actions
- **THEN** those actions are served as MCP tools
- **AND** the tool outputs include structured results in addition to readable text

#### Scenario: ExperienceEngine exposes review workflows as prompts
- **WHEN** ExperienceEngine offers reusable last-intervention or warning-review workflows
- **THEN** those workflows are exposed as MCP prompts when supported by the host
- **AND** review prompts link to the relevant ExperienceEngine resources when possible

#### Scenario: ExperienceEngine exposes light control workflows as prompts
- **WHEN** ExperienceEngine offers pause/resume or last-feedback workflows
- **THEN** those workflows are exposed as MCP prompts when supported by the host
- **AND** the prompt text instructs the agent to confirm before calling the underlying control tool
