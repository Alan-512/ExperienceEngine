## Context

The current repository already contains a mostly reusable experience engine under `src/analyzer`, `src/controller`, `src/feedback`, `src/input`, and `src/store/sqlite`. What remains host-specific is the OpenClaw plugin runtime under `src/plugin` and the data-path assumptions that live under the OpenClaw home directory. If the product stays shaped as an OpenClaw plugin, adding Claude Code or Codex later will require adapter logic to be bolted on around a host-specific boundary instead of a clean core.

## Goals / Non-Goals

**Goals:**
- Define a host-agnostic product architecture with a reusable ExperienceEngine core.
- Establish an adapter taxonomy: native adapter, wrapper adapter, and passive ingest adapter.
- Define a unified installer UX centered on `ee install <agent>`.
- Define the phase-one compatibility path for OpenClaw, Claude Code, and Codex.
- Establish a unified local data-home layout outside any single host's private directory.
- Make a clear distinction between officially documented host surfaces and inferred fallback mechanics.

**Non-Goals:**
- Implement Claude Code or Codex support in this change.
- Fully migrate existing OpenClaw runtime data in this change.
- Commit to a final packaging technology beyond the installer contract and directory layout.
- Claim that one install command implies one universal host integration mechanism.

## Decisions

### Product boundary becomes `core + adapters`

ExperienceEngine will be defined as a reusable core with host adapters layered on top. The OpenClaw adapter remains first-class, but no longer defines the product boundary.

Alternative considered:
- Keep OpenClaw as the main product and add one-off bridges for other agents. Rejected because it locks future compatibility to a host-specific lifecycle model.

### Support three adapter modes

- `native adapter`: uses an official plugin, hook, or other documented lifecycle API when available
- `wrapper adapter`: wraps a host CLI or launcher when no first-class plugin API exists
- `passive ingest adapter`: consumes transcripts/logs when neither native nor wrapper control is available

Phase one will only require:
- OpenClaw as a native adapter
- Claude Code as a native adapter built on official hooks, with MCP used where useful for local integration
- Codex as an MCP-first adapter plus a wrapper/harness for lifecycle capture until an official lifecycle hook surface is confirmed

Alternative considered:
- Wait for each host to expose a native plugin API. Rejected because it delays support and gives up practical compatibility.

Rationale:
- OpenClaw already exposes a documented plugin lifecycle, so it remains the cleanest native adapter case.
- Claude Code documents hooks for user prompts, tool execution, and session-end events, plus MCP integration, so phase one should use those official surfaces rather than a pure wrapper.
- Codex is currently documented for MCP integration, but this change does not assume an equivalent official lifecycle hook surface. Where lifecycle capture is needed beyond MCP, the plan stays in wrapper/harness territory until official docs say otherwise.

### Installer UX is unified even if implementation differs per host

Users should install ExperienceEngine through one product command surface:

`ee install openclaw`
`ee install claude-code`
`ee install codex`

Under the hood, each host may need different mechanics, but the user-facing mental model stays stable.

Clarification:
- `ee install <agent>` is a unified product command surface, not a promise that all hosts use the same adapter mechanism.
- In phase one, the command contract is specified for OpenClaw, Claude Code, and Codex, but only the existing OpenClaw adapter is already implemented in this repository today.

Expected phase-one install behavior:
- `ee install openclaw`: writes or updates plugin metadata and configuration for the OpenClaw adapter
- `ee install claude-code`: writes or updates Claude Code hook configuration and any required MCP registration
- `ee install codex`: writes or updates Codex MCP registration and, where needed, installs a wrapper/harness entrypoint for lifecycle capture

Expected operator-visible behavior:
- Users invoke one installer command family regardless of host.
- Adapter diagnostics remain host-specific, for example hooks/config merge checks for Claude Code and MCP/wrapper checks for Codex.
- Unsupported hosts are rejected explicitly rather than silently treated as generic wrapper targets.

### Data home moves to a product-owned directory

The long-term default storage root will become a product-owned directory such as `~/.experienceengine/`, with host-specific adapter metadata nested underneath it. OpenClaw-specific directories can remain supported during migration, but they should no longer be the architectural default.

Proposed shape:

```text
~/.experienceengine/
  sqlite/
  captures/
  backups/
  adapters/
    openclaw/
    claude-code/
    codex/
```

Alternative considered:
- Keep one data directory per host. Rejected because it weakens cross-agent reuse and complicates backup/import UX.

## Risks / Trade-offs

- [Wrapper adapters may be less powerful than native adapters] → Accept explicitly in the adapter taxonomy and keep native support preferred where available.
- [Moving the data home can complicate migration] → Stage migration as a later implementation phase with backward-compatible path support first.
- [One installer command may hide host-specific complexity] → Surface host-specific diagnostics via `ee doctor` and adapter-specific install notes without changing the core command surface.
- [Claude Code / Codex integration surfaces may change] → Anchor Claude Code to documented hooks and MCP, anchor Codex to documented MCP only, and mark any wrapper/harness behavior as an explicit fallback rather than as a claimed host-native API.
- [Codex may later expose richer official lifecycle hooks] → Treat that as an upgrade path for the Codex adapter rather than a phase-one assumption.

## Migration Plan

1. Extract a core-facing adapter contract and move OpenClaw-specific runtime code behind the OpenClaw adapter boundary.
2. Introduce the `ee` installer CLI with OpenClaw as the first supported target.
3. Add support for a product-owned data home while keeping OpenClaw path compatibility during transition.
4. Prototype a Claude Code adapter on top of official hooks plus MCP, and a Codex adapter on top of MCP plus wrapper/harness capture, after the OpenClaw adapter has been refit to the common contract.

Implementation status at the time of this change:
- OpenClaw is the only adapter already implemented and runtime-validated.
- Claude Code and Codex are intentionally documented here as planned adapter targets, not as shipping integrations.

## Open Questions

- Should the unified installer live in this repository or in a separate distribution package once adapter count grows?
- What is the minimal lifecycle wrapper contract Codex needs beyond MCP, if any, to provide useful attribution and intervention?
- Do we want one shared SQLite store across all agents by default, or a shared root with per-agent databases as the safer initial default?
- When Claude Code and Codex adapter prototypes are implemented, should we prefer one shared store or per-adapter namespaces inside one shared store as the first rollout?
