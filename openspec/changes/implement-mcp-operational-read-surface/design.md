## Context

ExperienceEngine now exposes a meaningful MCP-native interaction surface:
- inspect resources
- low-risk tools
- workflow prompts

However, a user who asks “is ExperienceEngine configured correctly?” or “is there a new version?” still relies on CLI-oriented logic. The product already has structured adapter inspection code and remote release lookup code, but the current composition is optimized for terminal tables rather than MCP payloads.

This change closes that gap by adding a shared operational read service and surfacing it through MCP.

## Goals / Non-Goals

**Goals:**
- Provide structured doctor state for `openclaw`, `claude-code`, and `codex`.
- Provide structured remote release state tied to a selected adapter.
- Expose those read-only views as both resources and read-only tools on the Codex MCP server.

**Non-Goals:**
- Add repair/upgrade/install actions to MCP in this change.
- Replace the existing CLI doctor command.
- Change the semantics of adapter inspection itself.

## Decisions

### 1. A shared operational service will compose local and remote read state

This change introduces a shared service that:
- reads adapter-specific local doctor state
- resolves the adapter's current package version
- performs remote release lookup
- returns one structured payload per adapter

Rationale:
- It avoids embedding CLI-table composition inside MCP callbacks.
- It keeps CLI and MCP aligned if the CLI later adopts the same structured service.

### 2. Operational reads will be exposed as both resources and tools

Resources:
- `experienceengine://doctor/{adapter}`
- `experienceengine://updates/latest/{adapter}`

Read-only tools:
- `experienceengine_doctor`
- `experienceengine_check_update`

Rationale:
- Resources fit the semantics of read-only state and support prompt/resource-link workflows.
- Tools make it easier for hosts or agents that are stronger at tool invocation than direct resource reading.

### 3. The update-check payload will be adapter-aware

Even though the remote release source is the shared package repository, the response should include:
- adapter
- local version state
- remote release status
- recommended next step text when an update is available

Rationale:
- Users think in terms of “my Codex integration” or “my Claude integration,” not only in terms of the package repo.

## Risks / Trade-offs

- [Remote release lookup can be unavailable] → Return structured unavailable state instead of failing the MCP call.
- [Operational reads overlap with CLI doctor] → Accept the overlap; the goal is shared semantics, not elimination of fallback CLI.

## Migration Plan

1. Add OpenSpec artifacts for operational read MCP support.
2. Add a shared operational read service.
3. Expose doctor/update resources and read-only tools on the Codex MCP server.
4. Add tests for shared service and MCP outputs.
5. Run `pnpm check` and `openspec validate --changes --strict`.
