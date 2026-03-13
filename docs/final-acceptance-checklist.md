# ExperienceEngine Final Acceptance Checklist

This checklist defines the first usable release acceptance bar for ExperienceEngine `v0.1.0`.

## Scope

This acceptance pass covers:
- core local experience engine behavior
- OpenClaw runtime/plugin integration
- Claude Code hooks + MCP integration
- Codex MCP-first integration
- MCP-native interaction surface
- CLI fallback surface
- state backup / export / import / rollback workflows

## Repository Health

- [x] `pnpm check` passes
- [x] `openspec validate --specs` passes
- [x] `openspec validate --changes --strict` passes
- [x] repository includes user-facing README and user guide

## Core Experience Flow

- [x] experience input records persist to SQLite
- [x] experience nodes persist to SQLite
- [x] scope task stats persist to SQLite
- [x] interventions can inject strategy guidance
- [x] non-matching tasks can skip intervention
- [x] interventions can record `helped`
- [x] interventions can record `harmed`

## OpenClaw Acceptance

- [x] `ee install openclaw` wires the host successfully
- [x] `ee doctor openclaw` reports install and host state
- [x] `ee repair openclaw` can recover host config drift
- [x] real OpenClaw runtime validation has exercised prompt, tool, and finalize paths
- [x] OpenClaw remains the primary plugin/runtime path rather than MCP-first interaction

## Claude Code Acceptance

- [x] `ee install claude-code` wires both hooks and MCP
- [x] `ee doctor claude-code` validates Claude wiring
- [x] real Claude hook payloads have been captured and replayed
- [x] Claude can use the shared ExperienceEngine MCP server
- [x] Claude runtime integration persists real task evidence

## Codex Acceptance

- [x] `ee install codex` wires the shared MCP server
- [x] `ee doctor codex` validates Codex wiring
- [x] Codex MCP startup timeout is configured for real sessions
- [x] real Codex sessions can call ExperienceEngine MCP tools
- [x] Codex runtime integration persists real task evidence

## MCP-Native Interaction Surface

- [x] read-only state is available through MCP resources
- [x] reusable workflows are available through MCP prompts
- [x] low-risk interaction actions are available through MCP tools
- [x] high-impact operational actions use `plan -> confirm -> execute`
- [x] Claude Code and Codex both use the shared MCP interaction server

## CLI Fallback Surface

- [x] inspect commands are available through `ee`
- [x] feedback commands are available through `ee`
- [x] node and scope controls are available through `ee`
- [x] backup / export / import / rollback are available through `ee`
- [x] install / doctor / repair / upgrade are available through `ee`

## State Safety

- [x] managed backups cover ExperienceEngine-owned state
- [x] import creates a safeguard backup before overwrite
- [x] rollback creates a safeguard backup before overwrite
- [x] exports are portable snapshots of managed ExperienceEngine state

## Release Decision

Release decision for `v0.1.0`:

- [x] Product is usable as a first public MVP release
- [x] Remaining gaps are product-hardening and UX refinement, not core blockers
