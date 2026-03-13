## Context

The engine is already working:
- experiences are extracted
- interventions happen
- feedback is persisted
- multiple hosts are supported

What is missing is a clear CLI product surface. Right now, the user mostly experiences ExperienceEngine indirectly through improved outcomes or through debugging commands such as `ee inspect` and `ee stats`. That is not enough for a mature CLI product.

The key constraint is that ExperienceEngine lives inside agent terminal workflows. Most competing CLI-side integrations do not show large explicit UI. That means ExperienceEngine should not overcorrect by becoming noisy. The right model is:

- visible when it matters
- silent when it does not
- inspectable on demand
- controllable without leaving the terminal

That also means inline visibility must be optional. Some users will want ExperienceEngine to stay fully invisible during normal terminal work even when injection occurs.

## Goals / Non-Goals

**Goals:**
- Define a CLI-native interaction model with low interruption cost.
- Make injection visible without printing long duplicated prompt content.
- Define lightweight user feedback commands rather than interactive prompts on every turn.
- Make stored experiences inspectable and manageable through explicit commands.

**Non-Goals:**
- Build a full TUI in this change.
- Add modal or wizard-style interactive flows to every task.
- Force feedback collection at the end of each task.
- Design a web dashboard.

## Product Stance

The CLI surface should follow this principle:

> ExperienceEngine should be noticeable at moments of value, but ignorable at moments of flow.

That leads to three interaction layers:

```text
Layer 1: Passive visibility
One-line notices only when intervention actually happens

Layer 2: On-demand inspection
Explicit CLI commands for "what happened just now?"

Layer 3: Active management
Explicit CLI commands for disable/cool/retire/feedback
```

## Core Decisions

### 1. Only injected turns get a visible inline notice

The product should not print notices for:
- `skip`
- unknown/no-op turns
- background persistence only

The product should print a short notice only when ExperienceEngine actually injects guidance.

Rationale:
- `skip` is the normal case and should stay silent.
- A visible notice is only useful when there is actual intervention to attribute.

### 2. Inline notices must be one line and summary-only

The main agent terminal should not print the full hint block again. The agent already sees the injected prompt content internally. Reprinting it to the user would create noise and duplicate context.

So the inline notice should only summarize:
- ExperienceEngine acted
- how many hints were injected
- what kind of experience dominated (`strategy` or `warning`)

Recommended default copy:

```text
[ExperienceEngine] Injected 1 strategy hint for this task.
```

Fallback compact form:

```text
[ExperienceEngine] Injected 1 hint for this task.
```

### 3. Warning notices should be even quieter than strategy notices

Warnings are valuable but easier to perceive as annoying. If warning-only injection is ever surfaced inline, it should use softer wording.

Recommended warning copy:

```text
[ExperienceEngine] Injected 1 caution hint for this task.
```

Not recommended:
- "Warning"
- "Danger"
- "Error prevention mode"

These are too alarming for routine CLI work.

### 4. Details belong in `inspect`, not in the main turn output

Users who want to know more should use explicit inspection commands. The main terminal output should not become an audit log.

Recommended command family:

```text
ee inspect --last
ee inspect recent
ee inspect node <id>
ee inspect active
```

These should answer:
- what happened on the last turn
- which nodes were injected
- why they were injected
- what the compact hints were
- what state those nodes are in now

### 5. Inline notices must be suppressible

Users should be able to turn inline notices off without disabling ExperienceEngine itself.

Recommended controls:

```text
ee config set notices.inline false
ee config set notices.inline true
```

Recommended behavior:
- default: inline notices enabled
- when disabled: injection still happens, but no inline turn notice is printed
- `inspect`, `feedback`, and management commands continue to work

Recommended confirmation copy:

```text
[ExperienceEngine] Inline notices disabled.
[ExperienceEngine] Inline notices enabled.
```

### 6. Feedback should be explicit and lightweight, not pushed every turn

The default product path should keep automatic helped/harmed inference.

Manual feedback should be a correction path, not a blocking question after each task.

Recommended command family:

```text
ee feedback --last helped
ee feedback --last harmed
ee feedback node <id> helped
ee feedback node <id> harmed
```

Optional short alias:

```text
ee fb --last helped
ee fb --last harmed
```

Not recommended:
- prompting after every task
- `y/n` interactive confirmations after every injection

### 7. Management is more important than inline explanation

For CLI products, trust comes less from visible chrome and more from control. Users need to know they can inspect and disable bad behavior.

Recommended command family:

```text
ee inspect active
ee inspect recent
ee disable node <id>
ee disable scope
ee cool node <id>
ee retire node <id>
```

The priority order should be:
1. inspect
2. disable / retire
3. feedback
4. richer inline visibility

## Interaction Model

### A. Normal task with no intervention

User experience:
- no ExperienceEngine line is printed
- agent output stays untouched

Reason:
- this is the common case and should remain invisible

### B. Task with intervention

User experience:
- one short line appears near the beginning of the turn
- no large explanation block is printed in the terminal

Recommended copy:

```text
[ExperienceEngine] Injected 1 strategy hint for this task.
```

If multiple hints:

```text
[ExperienceEngine] Injected 2 strategy hints for this task.
```

If warning-only:

```text
[ExperienceEngine] Injected 1 caution hint for this task.
```

### C. User wants to know what just happened

User runs:

```text
ee inspect --last
```

Recommended output shape:

```text
Session: claude-2026-03-12-abc
Scope: /mnt/d/project/ExperienceEngine
Task type: test_debug
Intervention: inject_conservative
Injected nodes:
- node_123 strategy active

Hints:
- Reproduce the failing auth test before editing implementation files.

Outcome:
- success
```

### D. User wants to see the current active experience pool

User runs:

```text
ee inspect active
```

Recommended output columns:
- `id`
- `type`
- `task`
- `state`
- `helped`
- `harmed`
- `last_used`
- `hint`

### E. User feels the hint helped or hurt

User runs:

```text
ee feedback --last helped
```

Recommended response:

```text
[ExperienceEngine] Recorded feedback for the last injected experience: helped.
```

or

```text
[ExperienceEngine] Recorded feedback for 2 injected experiences: harmed.
```

### F. User wants to stop a bad experience

User runs:

```text
ee disable node node_123
```

Recommended response:

```text
[ExperienceEngine] Disabled node node_123. It will no longer be injected.
```

If scope-level disable:

```text
[ExperienceEngine] Disabled interventions for this scope.
```

## Prompt Copy Guidelines

### Inline notice style

Must be:
- short
- neutral
- factual

Should avoid:
- hype
- long explanations
- emotionally loaded wording

Recommended format:

```text
[ExperienceEngine] <action summary>.
```

Examples:

```text
[ExperienceEngine] Injected 1 strategy hint for this task.
[ExperienceEngine] Injected 2 strategy hints for this task.
[ExperienceEngine] Injected 1 caution hint for this task.
```

Branding rule:
- use `ExperienceEngine` in all user-visible notices and acknowledgements
- reserve `ee` for command names and short operator syntax

### Inspection style

Should be:
- human-readable
- terminal-friendly
- compact but explicit

Not recommended:
- raw JSON by default
- deeply nested verbose prose

### Feedback acknowledgement style

Should be:
- immediate
- one line
- no confirmation loop unless destructive

Examples:

```text
[ExperienceEngine] Recorded feedback for the last injected experience: helped.
[ExperienceEngine] Recorded feedback for node node_123: harmed.
```

### Management copy

Must make state changes explicit.

Examples:

```text
[ExperienceEngine] Disabled node node_123. It will no longer be injected.
[ExperienceEngine] Retired node node_123. Historical stats were preserved.
[ExperienceEngine] Cooled node node_123. It will be considered less aggressively.
```

## Recommended Rollout Order

### Phase A: Visibility and inspection

- inline one-line injection notice
- inline notice suppression setting
- `ee inspect --last`
- `ee inspect active`

### Phase B: Manual correction

- `ee feedback --last`
- `ee feedback node <id>`

### Phase C: Management

- `ee disable node <id>`
- `ee retire node <id>`
- `ee cool node <id>`
- `ee disable scope`

## Risks / Trade-offs

- [Too much inline visibility can make the product feel noisy] → restrict inline notices to true injection events only.
- [Some users will not want any inline notices at all] → allow inline notices to be disabled without disabling the engine.
- [Too little visibility makes the product feel magical and untrustworthy] → add `inspect --last` and lightweight notices.
- [Prompting for feedback every turn can make users hate the product] → keep feedback command-driven, not turn-driven.
- [A rich command set can overwhelm users] → expose a small default set first and keep advanced management explicit.

## Open Questions

- Should the inline notice be emitted by ExperienceEngine itself or routed through host-specific adapters so each host can format it differently?
- Should `warning` notices be hidden entirely by default and only visible in `inspect --last`?
- Do we want a short alias layer such as `ee fb` and `ee ls`, or should the first release stay fully explicit?
