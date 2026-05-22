## ADDED Requirements

### Requirement: Gate native lifecycle implementation on Hook Contract Spike validation

ExperienceEngine MUST NOT implement or claim Antigravity native lifecycle support until a formal Hook Contract Spike verifies execution timing, payload schemas, stdout context mutation capabilities, and session termination stability.

#### Scenario: Execute hook contract spike and verify active context mutation
- **WHEN** the Antigravity integration begins
- **THEN** ExperienceEngine configures a temporary `hooks.json` in a test workspace
- **AND** it captures the raw `stdin` payloads for `PreInvocation`, `PostToolUse`, and `Stop` to verify schema shapes
- **AND** it asserts that writing formatted suggestions to the `PreInvocation` hook's `stdout` successfully mutates and injects constraints into the active session prompt context
- **AND** it asserts that `Stop` reliably fires at session end to avoid duplicate finalization calls

#### Scenario: Fallback to MCP-only mode on spike validation failure
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

### Requirement: Support conservative Antigravity installer shell after hook validation

After the hook validation gate passes, `ee install antigravity` MUST register the shared MCP server and validated Antigravity hooks without patching undocumented host files.

#### Scenario: Install Antigravity MCP and hook wiring

- **WHEN** a user runs `ee install antigravity` and the `antigravity` CLI is available on `PATH`
- **THEN** ExperienceEngine adds its MCP configuration through a supported Antigravity CLI or configuration surface
- **AND** it adds only validated Antigravity hook entries through documented hook configuration surfaces
- **AND** it writes adapter install-state under the shared ExperienceEngine data home for `antigravity`
- **AND** it reports setup state as `Installed` with `MCP registered`
- **AND** it reports lifecycle mode as `host_native_hooks_validated` when hooks are installed or `mcp_only` when hooks are intentionally not installed
- **AND** it prints the next validation instructions to start a fresh Antigravity session and query ExperienceEngine capabilities

#### Scenario: Install does not patch private Antigravity state

- **WHEN** ExperienceEngine installs Antigravity MCP or hook wiring
- **THEN** it does not edit undocumented Antigravity protobuf, cache, conversation, or internal state files
- **AND** any written files are limited to ExperienceEngine-owned install state or documented Antigravity MCP and hook configuration surfaces

### Requirement: Support doctor diagnostics for Antigravity wiring

`ee doctor antigravity` MUST check Antigravity CLI availability, ExperienceEngine install state, MCP registration, hook registration, and lifecycle mode separately.

#### Scenario: Inspect healthy Antigravity hook-backed installation

- **WHEN** a user runs `ee doctor antigravity` and the installation state, MCP entry, and validated hook entries are present
- **THEN** ExperienceEngine reports setup state as `Installed`
- **AND** it shows `MCP registered`
- **AND** it shows `Hooks registered`
- **AND** it shows `Lifecycle mode: host_native_hooks_validated`
- **AND** it verifies the active MCP config target and registered command when those details are available through supported host surfaces
- **AND** it reports native lifecycle automation only after real hook validation has passed

#### Scenario: Inspect missing or broken Antigravity adapter installation

- **WHEN** a user runs `ee doctor antigravity` and the MCP server, hook entries, or the `antigravity` CLI are missing
- **THEN** ExperienceEngine reports the adapter state as `Missing`, `MCP not registered`, or `Hooks not registered`
- **AND** it details the missing or drifted configuration target when known
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
