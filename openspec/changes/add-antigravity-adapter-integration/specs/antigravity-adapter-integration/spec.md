## ADDED Requirements

### Requirement: Scope Antigravity integration to Agent Desktop

ExperienceEngine MUST distinguish Antigravity Agent Desktop, Antigravity IDE, and Antigravity CLI as separate product surfaces.

#### Scenario: Report supported Antigravity surface
- **WHEN** documentation, install output, doctor output, or validation plans describe the `antigravity` adapter
- **THEN** they identify Antigravity Agent Desktop as the Phase 1 target surface
- **AND** they do not imply that the separate Antigravity IDE shell is adapted
- **AND** they identify `agy` as the standalone Antigravity CLI entrypoint when CLI behavior is discussed
- **AND** they describe `agy --add-dir <project-path>` as the validated headless CLI invocation shape on Windows
- **AND** they document that the separate `antigravity` command can point to the IDE shell and MUST NOT be treated as proof that the Agent Desktop or `agy` CLI is available

### Requirement: Separate user-level install from project activation

ExperienceEngine MUST treat the Antigravity adapter install as user-level EE capability while treating `.mcp.json` and `.agents/hooks.json` as project activation state.

#### Scenario: Install user-level Antigravity capability
- **WHEN** a user runs `ee install antigravity`
- **THEN** ExperienceEngine writes adapter install state under the configured user-level ExperienceEngine home
- **AND** project wiring is reported separately as current-project activation
- **AND** ExperienceEngine data and learned experience remain in the shared ExperienceEngine home
- **AND** project experience remains isolated by project scope rather than by duplicating per-project EE data stores

#### Scenario: Activate an Antigravity project explicitly
- **WHEN** a user runs `ee antigravity activate-project -C <project>`
- **THEN** ExperienceEngine writes or repairs the project `.mcp.json` and `.agents/hooks.json`
- **AND** it reports that EE data remains user-level
- **AND** it does not patch undocumented Antigravity private state

#### Scenario: Run Antigravity CLI through the wrapper
- **WHEN** a user runs `ee agy exec -C <project> "<prompt>"`
- **THEN** ExperienceEngine ensures current project activation before spawning `agy`
- **AND** it invokes `agy` with `--add-dir <project>` so the CLI loads project configuration
- **AND** it preserves the configured user-level ExperienceEngine home for hook execution

### Requirement: Gate native lifecycle implementation on Hook Contract Spike verification

ExperienceEngine MUST claim Antigravity Agent Desktop native lifecycle support only after a formal Hook Contract Spike and real Agent Desktop validation verify execution timing, payload schemas, stdout control output, context mutation capabilities, and session termination stability against the Agent Desktop host.

#### Scenario: Execute hook contract spike and verify active context mutation
- **WHEN** the Antigravity integration begins
- **THEN** ExperienceEngine configures a temporary `hooks.json` in a test workspace
- **AND** it captures the raw `stdin` payloads for `PreInvocation`, `PreToolUse`, `PostToolUse`, and `Stop` to verify schema shapes
- **AND** it asserts that writing formatted suggestions to the `PreInvocation` hook's `stdout` successfully mutates and injects constraints into the active session prompt context
- **AND** it asserts that `PreToolUse` accepts an explicit allow decision without denying host tool execution
- **AND** it asserts that `Stop` reliably fires at session end to avoid duplicate finalization calls

#### Scenario: Fallback to MCP-only mode on spike verification failure
- **WHEN** the hook contract spike fails (e.g. stdout mutation is unsupported, payloads are unstable, or events are missing)
- **THEN** ExperienceEngine halts native lifecycle adapter implementation
- **AND** it falls back to the `mcp_only` integration model
- **AND** the installer and doctor report `Lifecycle mode: mcp_only`
- **AND** it avoids claiming user experience consistency with Codex or Claude Code


### Requirement: Support direct MCP integration through a host-neutral surface

ExperienceEngine MUST expose a host-neutral MCP server surface suitable for Antigravity MCP registration without requiring users or docs to depend on Codex-specific naming.

#### Scenario: Register shared ExperienceEngine MCP server

- **WHEN** a user registers the ExperienceEngine MCP server inside Antigravity through a supported MCP configuration path
- **THEN** the server connects successfully using `StdioServerTransport`
- **AND** it registers at least the core lifecycle tools `experienceengine_lookup_hints`, `experienceengine_record_tool_result`, `experienceengine_finalize_task`, and `experienceengine_feedback_last`
- **AND** it registers at least the routine read resources `experienceengine://last`, `experienceengine://repo-summary`, `experienceengine://review`, and `experienceengine://governance`
- **AND** the public registration command and docs do not require Antigravity users to configure a Codex-named server command once the host-neutral entrypoint exists

### Requirement: Support conservative Antigravity installer shell after hook spike verification

`ee install antigravity` MUST initialize user-level Antigravity adapter state and activate the current project by registering the shared MCP server and validated lifecycle hooks. MCP-only mode remains available as an explicit fallback.

#### Scenario: Install Antigravity MCP and hook wiring

- **WHEN** a user runs `ee install antigravity`
- **THEN** ExperienceEngine adds its MCP configuration through a supported Agent Desktop project configuration surface or documented manual registration path
- **AND** it adds validated Antigravity hook entries through documented hook configuration surfaces
- **AND** it writes adapter install-state under the shared ExperienceEngine data home for `antigravity`
- **AND** it reports setup state as `Installed` with `MCP registered`
- **AND** it reports lifecycle mode as `host_native_hooks_validated` when hooks are installed or `mcp_only` when hooks are intentionally not installed
- **AND** it prints the next validation instructions to start Antigravity Agent Desktop in an activated project or run `ee agy exec -C <project-path>` and query ExperienceEngine capabilities

#### Scenario: Install does not patch private Antigravity state

- **WHEN** ExperienceEngine installs Antigravity MCP or hook wiring
- **THEN** it does not edit undocumented Antigravity protobuf, cache, conversation, or internal state files
- **AND** any written files are limited to ExperienceEngine-owned install state or documented Antigravity MCP and hook configuration surfaces

### Requirement: Support doctor diagnostics for Antigravity wiring

`ee doctor antigravity` MUST check Antigravity Agent Desktop/CLI surface availability, user-level ExperienceEngine install state, current-project MCP registration, current-project hook registration, and lifecycle mode separately.

#### Scenario: Inspect healthy Antigravity hook-backed installation

- **WHEN** a user runs `ee doctor antigravity` and the installation state, MCP entry, and validated hook entries are present
- **THEN** ExperienceEngine reports setup state as `Installed`
- **AND** it shows current project `MCP registered`
- **AND** it shows current project `Hooks registered`
- **AND** it shows `Lifecycle mode: host_native_hooks_validated`
- **AND** it reports `agy` CLI availability separately from any PATH-visible `antigravity` IDE command
- **AND** it reports whether Agent Desktop global activation is verified, unsupported, or unknown
- **AND** it verifies the active MCP config target and registered command when those details are available through supported host surfaces
- **AND** it reports native lifecycle automation only after hook spike verification has passed

#### Scenario: Inspect missing or broken Antigravity adapter installation

- **WHEN** a user runs `ee doctor antigravity` and the MCP server or hook entries are missing
- **THEN** ExperienceEngine reports the adapter state as `Missing`, `MCP not registered`, or `Hooks not registered`
- **AND** it details the missing or drifted configuration target when known
- **AND** it warns when `agy` is unavailable for headless CLI validation or when only the separate IDE command is present
- **AND** it recommends a supported recovery command such as `ee install antigravity` or `ee repair antigravity` only when that command has implemented reversible behavior

### Requirement: Support artifact-assisted causal attribution

ExperienceEngine MUST analyze Antigravity Markdown artifacts only as supplemental attribution evidence and MUST NOT rely on brittle string polling or overrule explicit runtime finalization facts.

#### Scenario: Parse successful task verification from configured artifacts

- **WHEN** the artifact analyzer receives configured Antigravity artifact candidates for the current EE session
- **THEN** it structurally parses Markdown evidence such as verification sections, checked tasks, command summaries, and explicit failure notes
- **AND** it extracts verification status as `passed`, `failed`, or `unverified`
- **AND** it identifies whether injected experience nodes were adopted only when artifact evidence can be tied to the current EE session or injected node ids
- **AND** it returns high confidence only when matching evidence is explicit and non-contradictory
- **AND** it does not override explicit runtime finalization success or failure signals

#### Scenario: Missing or ambiguous artifact evidence remains low confidence

- **WHEN** expected Antigravity artifacts are missing, renamed, ambiguous, or not tied to the current EE session
- **THEN** the artifact analyzer returns `unknown` or `unverified` attribution with low confidence
- **AND** it preserves the runtime finalization result as the authoritative task outcome
