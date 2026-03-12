## Why

ExperienceEngine has proven its core value inside OpenClaw, but the current product shape is still host-specific. To become a durable developer product that can support OpenClaw, Claude Code, Codex, and similar coding agents, the system needs a host-agnostic core, per-agent adapters, and a unified installation surface.

## What Changes

- Split the product architecture into a host-agnostic `core` and host-specific `adapters`.
- Reframe the existing OpenClaw integration as the first `native adapter` instead of the whole product.
- Define a unified installation model centered on `ee install <agent>` with different adapter strategies per host.
- Establish the first multi-host compatibility plan:
  - OpenClaw stays a native plugin adapter
  - Claude Code starts as an adapter built on officially documented hooks plus MCP
  - Codex starts as an MCP-first adapter and uses a wrapper/harness only for lifecycle capture that MCP alone does not provide
- Define a unified local data directory so multiple agents can share one ExperienceEngine store.
- Record a stricter compatibility rule: host strategies must be based on officially documented integration surfaces, and any inferred fallback behavior must be called out explicitly.
- Make the installation contract explicit: one product command surface may map to different host-specific install mechanics, and this change only defines that contract rather than shipping all host installers.

## Capabilities

### New Capabilities

- `experienceengine-core`: Host-agnostic experience extraction, intervention, feedback, and storage contracts.
- `agent-adapter-installation`: Unified installation and adapter registration workflow across supported coding agents.

### Modified Capabilities

- `openclaw-experience-plugin`: Re-scope OpenClaw as one supported adapter built on top of the common ExperienceEngine core rather than the product boundary itself.

## Impact

- Affects project structure, packaging, and installation UX.
- Affects data directory layout and future backup/import behavior.
- Affects how future Claude Code and Codex support is introduced.
- Tightens the evidence standard for adapter planning so unsupported assumptions do not leak into implementation.
- Clarifies that phase one implementation still starts from the existing OpenClaw adapter, with Claude Code and Codex support defined here as planned follow-on work.
