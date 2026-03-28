# Host-Native Routine Interaction Spec

## Status

Draft for implementation planning.

## Purpose

This spec defines the next lightweight product pass for keeping routine ExperienceEngine interaction inside the host agent whenever the host already supports it cleanly.

This pass is intentionally scoped to:

- `Codex`
- `Claude Code`

It does **not** attempt to make all hosts identical, and it does **not** pull `OpenClaw` into the same implementation slice.

## Product Principle

Prefer host-native routine interaction for normal review and feedback actions.

That means:

- the host session should be the first place the user asks routine questions
- CLI remains available, but it should read as fallback and operator control
- the product should not force users out to CLI for common “what just happened?” loops when the host already has the right surface

## Goals

1. Keep the most common ExperienceEngine follow-up actions inside `Codex` and `Claude Code`.
2. Make the normal path feel host-native without removing CLI fallback.
3. Limit this pass to a small set of high-frequency actions.
4. Keep `OpenClaw` on the same product language, but defer its routine-interaction UX to a later dedicated pass.

## Non-Goals

- full host-native replacement for every ExperienceEngine command
- removing CLI fallback
- introducing a new standalone UI
- redesigning retrieval, learning, or inspect internals
- widening this pass into an `OpenClaw` implementation

## Scope

This pass should cover only three routine action families:

1. `What was just injected?`
   - the user asks the host what ExperienceEngine just injected
2. `Why did it match?`
   - the user asks the host why the last intervention matched or why it was conservative
3. `Helped / harmed feedback`
   - the user marks the last intervention as helpful or harmful from inside the host session

These are the only actions that should move into the default host-native path in this phase.

## Why This Slice

These actions are the highest-frequency routine loop:

- inspect the last intervention
- understand whether to trust it
- tell the system whether it helped

They are also narrow enough that this pass can improve everyday usability without turning into a full host-native management project.

## Host Scope

### Codex

This pass should make `Codex` treat these actions as default host-native behavior:

- ask what ExperienceEngine just injected
- ask why it matched
- mark the last guidance as helpful or harmful

CLI remains for:

- explicit operator inspection
- automation
- repair
- advanced management

### Claude Code

This pass should apply the same routine pattern as `Codex`, as long as Claude already has the necessary host-side surface available.

The user should not need to leave the Claude session for these same three action families unless the host-native path is unavailable or broken.

### OpenClaw

`OpenClaw` is explicitly out of implementation scope for this pass.

For now:

- keep product language consistent
- keep current CLI/runtime boundary clear
- defer routine-interaction UX alignment to a later dedicated pass

## Product Language Requirements

For `Codex` and `Claude Code`, docs and guidance should consistently present:

- host session first
- CLI fallback second

Examples:

- first: “Ask the host agent what ExperienceEngine just injected.”
- second: “Fallback CLI: `ee inspect --last`.”

Avoid presenting both options with equal weight in the main path.

## Current Surface Strategy

The product already has the right building blocks:

- MCP-capable inspection surfaces
- MCP feedback tools
- CLI fallback commands
- explanation and trust-summary layers

This pass should mainly improve:

- prioritization
- wording
- help and guidance flow

It should not require a new runtime architecture.

## In-Scope Surfaces

This spec should primarily influence:

- `README.md`
- `docs/user-guide.md`
- host-oriented MCP prompts/resources where wording affects routine usage
- any agent guidance templates that currently over-point to CLI for these three actions

It may also influence:

- command help text, if that text currently competes with the host-native path

## Out-Of-Scope Surfaces

This pass should not pull the following into the default host-native path:

- backup / rollback
- import / export
- upgrade / repair
- node lifecycle actions like cool / retire
- broad inventory management

Those remain operator or explicit inspection workflows unless separately re-scoped later.

## Recommended Implementation Shape

1. Define a single default routine path for `Codex` and `Claude Code`:
   - host session first
   - CLI fallback second
2. Apply that path only to:
   - last intervention review
   - last-match explanation
   - last-intervention helped/harmed feedback
3. Update docs and command/help wording so CLI reads as fallback, not co-equal default behavior.
4. Keep `OpenClaw` documented as a later dedicated alignment pass instead of an untracked future idea.

## Acceptance Criteria

1. For `Codex` and `Claude Code`, the normal documented path for the three routine actions is host-native first.
2. CLI remains available but is clearly presented as fallback for those actions.
3. The product does not widen this pass into advanced management flows.
4. `OpenClaw` is explicitly deferred without ambiguity, while keeping shared product language where possible.

## Open Decisions For The Implementation Plan

- Which exact docs or help surfaces still over-promote CLI for these three actions
- Whether any Codex/Claude host guidance templates need explicit wording updates
- Whether `inspect --last` help text should be rephrased now or left for the broader CLI-help pass
