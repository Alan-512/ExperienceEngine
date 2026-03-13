## Context

The MCP-native interaction design for ExperienceEngine already distinguishes:
- resources for read-only state
- tools for executable actions
- prompts for user-controlled workflow entry points

The first implementation slice already shipped resources and low-risk tools on the Codex MCP server. That makes the surface usable, but still somewhat technical: users or agents must know exact tool names or resource URIs.

The next implementation slice should therefore add prompts. Prompts are especially important for hosts that can expose them as slash-like entry points or other discoverable workflow menus. Even in hosts without dedicated slash rendering, prompts still provide a stable, user-controlled interaction contract.

## Goals / Non-Goals

**Goals:**
- Add prompt-layer entry points for the highest-value ExperienceEngine workflows.
- Keep prompts lightweight and compositional: they should guide use of resources and tools, not duplicate runtime behavior.
- Keep prompts aligned with the existing MCP resources and low-risk tools already implemented.

**Non-Goals:**
- Execute mutations directly from prompt registration.
- Add high-impact operational prompts for install/repair/upgrade in this change.
- Add host-specific slash aliases beyond the standard MCP prompt layer.

## Decisions

### 1. Prompts will guide, not mutate

The prompts added in this change are workflow entry points, not hidden mutation channels. They either:
- point the agent at an existing ExperienceEngine resource and ask it to review/summarize it
- or instruct the agent to call an existing low-risk tool after confirmation

Rationale:
- This keeps the prompts aligned with MCP semantics.
- It avoids creating a second, implicit action layer that bypasses tools.

### 2. The first prompts will focus on high-frequency workflows

The first prompt set is:
- `experienceengine_show_last_intervention`
- `experienceengine_review_recent_injected`
- `experienceengine_review_warning_nodes`
- `experienceengine_pause_current_project`
- `experienceengine_resume_current_project`
- `experienceengine_mark_last_experience_helpful`
- `experienceengine_mark_last_experience_harmful`

Rationale:
- These cover the most common read/review and light-control paths.
- They align directly with the already-implemented resources and tools.

### 3. Review prompts should include resource links

Review-oriented prompts should embed a resource link where possible instead of only mentioning a URI in plain text.

Rationale:
- Resource links make the relationship between prompts and resources explicit.
- This gives richer hosts more options for rendering and follow-up.

### 4. Action prompts should be explicit about confirmation

Prompts that lead to state change should explicitly tell the agent to confirm before invoking the corresponding tool.

Rationale:
- Even for low-risk control actions, prompts should reflect the risk-tiering decision already present in the MCP-native interaction design.

## Risks / Trade-offs

- [Prompt wording may need iteration across hosts] → Keep prompt text concise and operational rather than host-specific.
- [Some hosts may ignore prompt resource links] → Include human-readable text alongside every link so prompts still work as plain text.

## Migration Plan

1. Add OpenSpec artifacts for prompt implementation.
2. Register the first ExperienceEngine prompts on the Codex MCP server.
3. Add tests for prompt registration and payload shape.
4. Run `pnpm check` and `openspec validate --changes --strict`.
