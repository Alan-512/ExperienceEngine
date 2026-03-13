## Context

ExperienceEngine currently has three realities:

1. The engine already works.
   - experiences are extracted
   - interventions happen
   - feedback is persisted
   - OpenClaw, Claude Code, and Codex all have real runtime integration paths

2. The repository now has a meaningful CLI user surface.
   - inline notices
   - `ee inspect ...`
   - `ee feedback ...`
   - `ee disable/enable/cool/retire ...`

3. The surrounding agent ecosystem is moving toward MCP-native interaction models.
   - Codex documentation centers MCP as the host integration surface.
   - Claude Code supports MCP and also exposes MCP prompts as slash-command style interaction.
   - The MCP ecosystem itself distinguishes `Resources`, `Prompts`, and `Tools` rather than treating all host interactions as generic commands.

That means ExperienceEngine should not stop at “a better CLI”. The CLI remains useful, but it should no longer be the primary long-term interaction model.

## Goals / Non-Goals

**Goals:**
- Define a long-term interaction architecture where MCP becomes the primary user-facing interaction surface.
- Separate ExperienceEngine interactions into `Resources`, `Prompts`, and `Tools`.
- Define which actions remain best suited to fallback CLI operation.
- Define risk tiers so high-impact operations are exposed safely inside agent workflows.
- Keep the design durable across agent evolution rather than tightly coupling it to one host's slash command syntax.

**Non-Goals:**
- Implement the MCP-native surface in this change.
- Replace the current CLI immediately.
- Require every host to expose identical prompt/slash capabilities.
- Specify the exact final UI text for every future MCP prompt/tool response.

## Decisions

### 1. MCP becomes the primary day-to-day interaction surface

ExperienceEngine should treat MCP as the main user interaction channel for:
- inspection
- feedback
- scope control
- safe operational queries

The existing `ee` CLI remains important, but it is reclassified as:
- fallback
- automation
- recovery
- scripting

Rationale:
- Users often stay inside the agent and do not want to leave the current conversation context.
- MCP is increasingly the stable cross-host integration surface, especially for Codex and Claude Code.
- A unified MCP contract is more future-proof than trying to normalize slash command behavior across hosts.

Alternative considered:
- Keep the CLI as the primary interface and treat MCP as optional. Rejected because it makes normal user interaction feel bolted on to agent workflows rather than native to them.

### 2. ExperienceEngine should use the MCP triad: Resources, Prompts, Tools

The interaction contract should be split as follows:

**Resources**
- read-only state and context
- recent records
- node inventories
- install/doctor status
- backup listings

**Prompts**
- user-controlled entry points
- slash-like workflows where supported
- inspect/review/guide flows that are better expressed as reusable interaction templates than raw tools

**Tools**
- executable actions
- feedback writes
- scope control
- repair/upgrade/install
- backup/export/import

Rationale:
- This matches MCP's own conceptual separation.
- It prevents overloading tools with every interaction use case.
- It gives Claude Code a clean path to slash-like exposure through MCP prompts.

Alternative considered:
- Put everything in tools. Rejected because it collapses user-controlled and model-controlled interaction into one bucket and makes the interaction surface less discoverable and less safe.

### 3. Risk-tiered MCP actions are required for durability

ExperienceEngine MCP actions should be divided into three tiers:

**Tier 1: Read-only**
- safe to call directly
- no confirmation required

Examples:
- inspect last
- inspect recent
- list active nodes
- inspect node
- doctor/status/check update

**Tier 2: Behavioral control**
- changes ExperienceEngine state
- user confirmation recommended

Examples:
- feedback last/node
- disable/enable scope
- cool/retire node

**Tier 3: Operational / high-impact**
- changes host wiring, files, or versioned installation state
- explicit confirmation and dry-run/plan recommended

Examples:
- install
- repair
- upgrade
- backup/export/import
- rollback

Rationale:
- MCP tools are powerful, but agent-driven execution needs clearer safety boundaries as products mature.
- This structure aligns with the broader trend toward structured confirmation, elicitation, and task-based operation in the MCP ecosystem.

### 4. CLI remains the canonical fallback and automation surface

Even if the MCP surface becomes primary, the CLI should continue to exist for:
- CI and scripting
- host-outage recovery
- broken agent/MCP sessions
- manual emergency repair

Rationale:
- MCP-first should not mean MCP-only.
- A mature product needs a non-conversational recovery path.

### 5. Host presentation differs, but the ExperienceEngine contract stays unified

The product contract should be one ExperienceEngine interaction model, with host-specific presentation:

**Codex**
- MCP-first host
- best candidate for first complete MCP-native rollout

**Claude Code**
- hooks for runtime
- MCP for user interaction
- MCP prompts can act as slash-like entry points where useful

**OpenClaw**
- runtime remains plugin/hook driven
- user interaction should reuse the same MCP or internal tool semantics where possible
- CLI fallback remains especially important if host-native user tool presentation is weaker

Rationale:
- Host differences are real, but the user should not experience ExperienceEngine as three different products.

## Interaction Model

### Layer 1: Automatic runtime layer

ExperienceEngine continues to:
- inject automatically
- record automatically
- update feedback automatically

Default inline visibility remains intentionally low-noise:

```text
[ExperienceEngine] Injected 1 strategy hint for this task.
```

### Layer 2: MCP primary interaction layer

This becomes the default way users query and control ExperienceEngine inside agent workflows.

Examples of natural-language intents:
- "What did ExperienceEngine just inject?"
- "Show the last 5 injected turns."
- "List active warning nodes."
- "Mark that last experience as harmful."
- "Pause ExperienceEngine for this project."
- "Check whether ExperienceEngine is configured correctly."

### Layer 3: CLI fallback layer

The CLI remains the fallback for:
- explicit scripting
- automation
- failure recovery
- operations outside the agent

## Recommended MCP Surface

### Resources

Recommended initial resource families:

```text
experienceengine://last
experienceengine://recent?limit=10
experienceengine://recent?limit=10&injected_only=true
experienceengine://nodes/active
experienceengine://nodes/by-state/retired
experienceengine://nodes/by-type/warning
experienceengine://node/<id>
experienceengine://doctor
experienceengine://updates/latest
```

### Prompts

Recommended prompt families:

```text
show_last_intervention
review_recent_injected
review_warning_nodes
pause_current_project
resume_current_project
mark_last_experience_helpful
mark_last_experience_harmful
```

These are especially valuable in hosts that can expose MCP prompts as slash-like entry points.

### Tools

Recommended tool families by tier:

**Tier 1**
- `inspect_last`
- `inspect_recent`
- `list_active_nodes`
- `inspect_node`
- `doctor`
- `check_update`

**Tier 2**
- `feedback_last`
- `feedback_node`
- `disable_scope`
- `enable_scope`
- `cool_node`
- `retire_node`

**Tier 3**
- `install`
- `repair`
- `upgrade`
- `backup`
- `export`
- `import`
- `rollback`

## Risks / Trade-offs

- [The product may temporarily support both CLI-first and MCP-first paths] → Accept during migration; clarify that CLI is the fallback and MCP is the primary future path.
- [Hosts do not expose identical MCP prompt/slash affordances] → Keep the core ExperienceEngine interaction contract host-neutral and treat prompt presentation as a host capability overlay.
- [Overusing tools for read-only actions could reduce discoverability and increase confirmation friction] → Prefer resources and prompts for read-oriented interactions.
- [High-impact operations inside agent conversations could become unsafe] → Use explicit tiering, dry-run planning, and confirmation semantics before implementing them.
- [OpenClaw may lag behind Claude/Codex in MCP-native user interaction] → Accept asymmetry at the presentation layer while keeping the underlying ExperienceEngine contract unified.

## Reference Snapshot

This design is based on publicly documented surfaces reviewed on **2026-03-13**:

- OpenAI MCP / Codex docs: `https://developers.openai.com/resources/docs-mcp`
- Claude Code MCP docs: `https://code.claude.com/docs/en/mcp`
- Claude Code slash commands: `https://code.claude.com/docs/en/slash-commands`
- MCP Tools spec: `https://modelcontextprotocol.io/specification/2025-06-18/server/tools`
- MCP concepts for prompts: `https://modelcontextprotocol.info/docs/concepts/prompts/`
- MCP specification / version history: `https://modelcontextprotocol.info/specification/`
