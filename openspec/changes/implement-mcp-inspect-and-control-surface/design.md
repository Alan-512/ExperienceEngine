## Context

The repository already has the first generation of a CLI user surface:
- `ee inspect --last|active|recent|node|state|type`
- `ee feedback --last|node`
- `ee disable node|scope`
- `ee enable scope`
- `ee cool node`
- `ee retire node`

Separately, the MCP-native interaction design has already been decided:
- MCP becomes the primary day-to-day user interaction surface
- `Resources` should represent read-only state
- `Tools` should represent executable actions
- high-impact operations should be deferred until they can support confirmation and planning

This change implements the first safe slice of that design. It deliberately avoids prompts and operational tools. The goal is to give Codex a real MCP-native read/control surface without overloading the first implementation with upgrade, repair, backup, or rollback behavior.

## Goals / Non-Goals

**Goals:**
- Add a shared service that returns structured inspect/control results.
- Expose inspect-style MCP Resources from the existing Codex MCP server.
- Expose low-risk MCP Tools for feedback and scope enable/disable.
- Keep CLI behavior consistent by reusing the same shared logic where practical.

**Non-Goals:**
- Implement MCP Prompts in this change.
- Expose `install / repair / upgrade / import / rollback` in MCP.
- Replace the CLI as a fallback surface.
- Change runtime injection behavior beyond existing scope-disable gating.

## Decisions

### 1. Shared interaction logic will live below both CLI and MCP

The current CLI commands mix repository reads/writes with console rendering. MCP cannot safely reuse terminal-oriented code, so the first implementation step is to extract a shared interaction service that:
- returns structured data for inspect views
- returns structured acknowledgements for low-risk mutations
- hides direct repository orchestration from both CLI and MCP

Rationale:
- This prevents semantic drift between CLI and MCP.
- It lets future Claude/OpenClaw MCP exposure reuse the same contract.
- It keeps the CLI rendering layer thin.

Alternative considered:
- Leave CLI commands as-is and reimplement the same behavior directly inside the Codex MCP server.
  - Rejected because it duplicates business rules and increases drift risk.

### 2. The first MCP Resources will mirror the strongest existing inspect views

The first resources should cover the highest-value read paths:
- `experienceengine://last`
- `experienceengine://recent/{mode}/{limit}`
- `experienceengine://nodes/active`
- `experienceengine://node/{id}`
- `experienceengine://nodes/state/{state}`
- `experienceengine://nodes/type/{type}`

`mode` for recent is initially:
- `all`
- `injected`

Rationale:
- These directly map to already-proven inspect views.
- They are read-only and fit MCP resource semantics cleanly.
- They cover the majority of “what just happened?” and “what does ExperienceEngine know?” user questions.

Alternative considered:
- Expose all inspect views as tools first.
  - Rejected because the MCP-native design explicitly reserves read-only state for resources.

### 3. The first MCP Tools will stay in the low-risk tier

The first mutation tools should be:
- `experienceengine_feedback_last`
- `experienceengine_feedback_node`
- `experienceengine_disable_scope`
- `experienceengine_enable_scope`

This phase intentionally excludes:
- node retirement/cooling
- install/repair/upgrade
- backup/export/import

Rationale:
- Feedback and scope toggles are meaningful but still low enough risk for a first MCP control slice.
- Node lifecycle operations can follow next if the first slice proves stable.

Alternative considered:
- Include `cool_node` and `retire_node` immediately.
  - Deferred to keep the first MCP control slice small and easier to reason about.

### 4. Resource payloads and tool results should be structured first, text second

Resources will return JSON-shaped documents serialized as `application/json`.
Tools will return both:
- human-readable `content`
- `structuredContent` with explicit output schemas where practical

Rationale:
- Structured payloads are more future-proof for agent-side consumption.
- Human-readable text still helps in hosts with weaker structured rendering.

### 5. Codex is the first full rollout target

This first implementation lands on the existing Codex MCP server because Codex is already MCP-first in this repository.

Rationale:
- It minimizes architectural churn.
- It creates a concrete implementation that future Claude/OpenClaw interaction layers can follow.

## Risks / Trade-offs

- [CLI refactor may touch already-stable commands] → Keep CLI output shape stable and limit the refactor to shared read/write logic.
- [Resource URI design may need iteration] → Use simple, explicit URI families with low ambiguity and avoid over-generalized templates.
- [Tool output could diverge from resource output] → Reuse shared typed result objects so both surfaces draw from the same source data.

## Migration Plan

1. Add OpenSpec artifacts for this change.
2. Introduce a shared interaction service for inspect and low-risk control operations.
3. Refactor existing CLI commands to use the shared service where touched.
4. Add Codex MCP Resources and low-risk Tools.
5. Add tests for shared service behavior and Codex MCP interaction outputs.
6. Run `pnpm check` and `openspec validate --changes --strict`.

## Open Questions

- Whether the next slice should add MCP prompts or node lifecycle tools first.
- Whether `doctor` should be the first read-only operational MCP tool after this change.
