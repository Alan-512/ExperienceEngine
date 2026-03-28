# OpenClaw Routine Interaction Spec

## Status

Approved for implementation.

## Purpose

This spec defines the first full `OpenClaw` routine-interaction pass.

Unlike the earlier `Codex + Claude Code` host-native pass, `OpenClaw` does not currently have an MCP-native interaction layer for ExperienceEngine. The product still needs a real in-host routine loop, not just documentation that points back to CLI fallback.

## Product Goal

Keep the three highest-frequency ExperienceEngine follow-up actions inside the normal `OpenClaw` host session:

1. review what ExperienceEngine just injected
2. review why the last hint matched
3. mark the last intervention as helped or harmed

## Non-Goals

- full MCP parity with `Codex` or `Claude Code`
- moving advanced operator actions into the host session
- redesigning ExperienceEngine learning, retrieval, or scoring
- creating a new standalone UI

## Product Principle

For `OpenClaw`, “host-native routine interaction” means:

- the user asks the normal host agent directly
- the plugin resolves the request from grounded ExperienceEngine state
- the agent answers from that grounded state without sending the user to CLI first

It does **not** mean adding a new MCP layer inside `OpenClaw`.

## Scope

This pass must fully support three routine action families inside the `OpenClaw` host session:

### 1. What was just injected?

The plugin should detect routine prompts such as:

- "What did ExperienceEngine just inject?"
- "Show the last ExperienceEngine intervention."

It should provide the host model with grounded last-intervention data so the model can answer directly in-session.

### 2. Why did it match?

The plugin should detect prompts such as:

- "Why did that ExperienceEngine hint match?"
- "Why was that intervention conservative?"

It should provide the host model with grounded explanation data:

- route or delivery style
- decision explanation
- trust summary when available

### 3. Helped / harmed feedback

The plugin should detect prompts such as:

- "Mark the last ExperienceEngine intervention as helpful."
- "Mark the last ExperienceEngine intervention as harmful."

It should record the feedback immediately through the interaction service and then let the host model acknowledge the result in-session.

## Required Behavior

### Grounded, Not Generative-Only

The plugin must pull real state from `ExperienceInteractionService`.

It must not rely on the model to infer:

- what was injected
- why it matched
- whether feedback was recorded

### No CLI-First Deflection

For these three routine actions, the injected host context should not default to telling the user to run CLI.

CLI remains valid only as:

- operator fallback
- deeper inspection
- failure recovery

### No Learning Pollution

These routine-control turns are not normal coding tasks.

They must not:

- create normal task history
- create reusable experience candidates
- enter the normal learning loop

The plugin should treat them as host-side control interactions and short-circuit task finalization.

## Implementation Shape

### 1. Intent detection inside the OpenClaw plugin

Add a narrow intent detector for the three routine action families.

The detector should stay conservative and only trigger on explicit ExperienceEngine review/feedback phrasing.

### 2. Grounded interaction formatter

Add a formatter that turns interaction-service state into short host-facing context blocks for:

- last intervention review
- last-match explanation
- feedback acknowledgement

These blocks should:

- stay concise
- provide grounded data
- tell the model to answer directly
- keep deeper evidence in inspect/CLI surfaces

### 3. Finalization bypass for control turns

When the current user turn is one of these routine-control actions, the plugin should not send it through normal ExperienceEngine finalization.

This is required to keep the learning loop clean.

## Acceptance Criteria

1. In `OpenClaw`, the user can ask what ExperienceEngine just injected and get an in-session grounded answer.
2. In `OpenClaw`, the user can ask why the last hint matched and get an in-session grounded answer.
3. In `OpenClaw`, the user can mark the last intervention as helped or harmed without leaving the host session.
4. These routine-control turns do not create new normal task runs or learning candidates.
5. CLI fallback remains available for deeper inspection and operator workflows, but it is no longer the default answer for these three actions.
