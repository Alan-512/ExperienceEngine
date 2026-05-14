# mcp-native-interaction-surface Specification

## Purpose
Define ExperienceEngine's long-term MCP-native interaction model across resources, prompts, and tools, with clear risk tiering and CLI fallback semantics.
## Requirements
### Requirement: ExperienceEngine uses MCP as its primary day-to-day interaction surface
ExperienceEngine SHALL define its long-term user interaction model around MCP rather than around standalone CLI commands.

#### Scenario: User inspects ExperienceEngine inside an agent session
- **WHEN** a user asks an agent to inspect ExperienceEngine state or recent behavior
- **THEN** the preferred interaction path is through ExperienceEngine MCP surfaces
- **AND** the standalone CLI remains available as a fallback path

#### Scenario: Users can inspect operational state inside an agent session
- **WHEN** a user asks an agent to check ExperienceEngine installation health or update state
- **THEN** ExperienceEngine exposes that read-only operational state through MCP resources or read-only tools
- **AND** the standalone CLI remains available as fallback

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

#### Scenario: Operator review metadata explains read-only drill-down
- **WHEN** ExperienceEngine lists MCP capabilities or brokered inspect actions
- **THEN** the operator review resource/action descriptions identify the flow as read-only and point to repo policy, hygiene, and export draft drill-down surfaces
- **AND** they do not describe the review flow as an export writer, policy restore action, node lifecycle action, or console workflow

#### Scenario: The first low-risk control surface is exposed as tools
- **WHEN** ExperienceEngine exposes feedback or scope enable/disable actions
- **THEN** those actions are served as MCP tools
- **AND** the tool outputs include structured results in addition to readable text

#### Scenario: ExperienceEngine exposes review workflows as prompts
- **WHEN** ExperienceEngine offers reusable last-intervention or warning-review workflows
- **THEN** those workflows are exposed as MCP prompts when prompts are supported by the host integration
- **AND** review prompts link to the relevant ExperienceEngine resources when possible

#### Scenario: ExperienceEngine exposes light control workflows as prompts
- **WHEN** ExperienceEngine offers pause/resume or last-feedback workflows
- **THEN** those workflows are exposed as MCP prompts when prompts are supported by the host integration
- **AND** the prompt text instructs the agent to confirm before calling the underlying control tool

### Requirement: ExperienceEngine MCP actions are risk-tiered
ExperienceEngine SHALL classify MCP actions by risk so that high-impact operations are not treated the same as read-only inspection.

#### Scenario: Read-only MCP actions require no special confirmation
- **WHEN** an ExperienceEngine MCP action only reads state
- **THEN** it is classified as a read-only action

#### Scenario: High-impact MCP actions require stronger safeguards
- **WHEN** an ExperienceEngine MCP action changes installation, repair, upgrade, import, or rollback state
- **THEN** it is classified as high-impact
- **AND** the design requires explicit confirmation and a planning or dry-run step before execution

#### Scenario: Medium-risk node lifecycle controls are exposed as explicit tools
- **WHEN** ExperienceEngine exposes node cooling or retirement controls
- **THEN** those actions are exposed as MCP tools
- **AND** they remain distinct from high-impact operational actions such as upgrade or rollback

### Requirement: Host adapters converge on a unified MCP-primary interaction contract
ExperienceEngine SHALL expose the same MCP-primary interaction contract across hosts where host capabilities allow it, while keeping OpenClaw as the baseline validation host for the core learning loop.

#### Scenario: Claude Code reuses the shared ExperienceEngine MCP server
- **WHEN** Claude Code needs ExperienceEngine interaction features such as inspect, prompts, or low-risk control tools
- **THEN** it reuses the shared ExperienceEngine MCP server contract
- **AND** it does not require a Claude-specific duplicate interaction server

#### Scenario: Codex reuses the shared MCP interaction contract without becoming the core learning baseline
- **WHEN** Codex needs ExperienceEngine interaction features such as inspect, prompts, or low-risk control tools
- **THEN** it reuses the shared ExperienceEngine MCP server contract
- **AND** its interaction support does not by itself redefine the primary baseline host for core learning validation

### Requirement: High-impact operational actions are exposed through plan-and-confirm MCP workflows
ExperienceEngine SHALL expose supported high-impact operational actions through MCP only with explicit planning and confirmation semantics.

#### Scenario: Install is planned before execution
- **WHEN** an agent wants to install ExperienceEngine for a supported adapter through MCP
- **THEN** it first obtains a structured install plan
- **AND** the plan includes a confirmation token required for execution

#### Scenario: Repair is blocked without confirmation
- **WHEN** an agent attempts to run a high-impact repair action without a valid prior confirmation token
- **THEN** ExperienceEngine rejects the action
- **AND** instructs the caller to obtain a fresh plan first

#### Scenario: Upgrade execution reuses canonical installer flows
- **WHEN** an agent confirms an upgrade through MCP
- **THEN** ExperienceEngine executes the same upgrade semantics used by the CLI fallback path

### Requirement: ExperienceEngine state lifecycle is exposed through managed backup and restore workflows
ExperienceEngine SHALL expose backup, export, import, and rollback workflows over its own managed state using the same MCP plan-and-confirm safety model.

#### Scenario: Backup inventory is available as read-only MCP state
- **WHEN** an agent wants to inspect available ExperienceEngine backups
- **THEN** ExperienceEngine exposes backup inventory through read-only MCP resources

#### Scenario: Backup is planned before execution
- **WHEN** an agent wants to create an ExperienceEngine backup through MCP
- **THEN** it first obtains a structured backup plan
- **AND** the plan includes a confirmation token required for execution

#### Scenario: Rollback creates a safeguard backup
- **WHEN** an agent confirms an ExperienceEngine rollback through MCP
- **THEN** ExperienceEngine creates a safeguard backup of the current managed state before restoring the selected backup

#### Scenario: Import restores a valid exported snapshot
- **WHEN** an agent confirms an ExperienceEngine import through MCP with a valid snapshot path
- **THEN** ExperienceEngine restores the managed state from that snapshot
- **AND** it records the safeguard backup created before the restore

### Requirement: MCP inspection surfaces expose node explainability
ExperienceEngine SHALL expose richer node provenance and attribution details through its MCP-native inspection surfaces once the core engine persists that data.

#### Scenario: Node resource includes provenance fields
- **WHEN** an MCP client reads an individual ExperienceEngine node resource
- **THEN** the payload includes available provenance and attribution fields for that node
- **AND** the payload remains structured for agent consumption

#### Scenario: Last-intervention inspection can reference attributed records
- **WHEN** an MCP client inspects the latest ExperienceEngine intervention
- **THEN** the response can identify the originating record and attributed node details when available

### Requirement: Routine explain surfaces report skip reasons

ExperienceEngine SHALL expose the most recent no-injection reason through routine inspect or explain surfaces.

#### Scenario: User asks why nothing was injected

- **WHEN** a user asks why ExperienceEngine did not inject guidance for the last task
- **THEN** the host-facing routine surface SHALL return the structured skip reason and a concise explanation

