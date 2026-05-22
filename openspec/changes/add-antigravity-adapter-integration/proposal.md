# Change Proposal: Add Antigravity Adapter Integration

## Why

Antigravity can register MCP servers and now documents custom lifecycle hooks. It is a plausible ExperienceEngine host for multi-agent coding workflows. The integration still must preserve ExperienceEngine's reliability boundary: MCP is a structured in-session interaction surface, while hooks or wrapper ownership must provide the automatic lifecycle path.

ExperienceEngine should not implement the product adapter until the Antigravity hook contract is validated against the real local host. The first step is a host-surface validation spike, not a full implementation.

## What Changes

- Add an explicit implementation gate: no product Antigravity adapter work proceeds until real Antigravity hooks are validated for task start, tool-result capture, and stop/finalize semantics.
- Add a host-neutral shared MCP server surface suitable for Antigravity MCP registration without Codex-specific naming.
- Add planned conservative Antigravity installer and doctor requirements, but keep them pending behind the hook validation gate.
- Add artifact-assisted attribution requirements that treat Antigravity artifacts as supplemental evidence, not as the primary runtime loop.

## Impact

- Antigravity implementation is intentionally paused until the hook validation spike proves the host contract.
- Operators and future implementers get clear status language such as `MCP registered`, `Lifecycle mode: mcp_only`, and `Lifecycle mode: host_native_hooks_validated`.
- Native lifecycle work has a clean place to attach once Antigravity hooks are proven locally rather than assumed from documentation alone.
