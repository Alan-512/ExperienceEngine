## Context

The current CLI user-visible surface now covers:
- one-line inline notices
- `ee inspect --last`
- `ee inspect active`
- `ee config set notices.inline ...`

That is enough to make ExperienceEngine visible, but not enough to make it user-controllable. The next step is not richer inline UI. It is explicit control:
- users must be able to suppress bad nodes
- users must be able to disable a noisy scope
- users must be able to reinforce or correct automatic helped/harmed attribution

The implementation needs to stay CLI-native and low ceremony. It also needs to avoid inventing a large new data model just to ship the first control surface.

## Goals / Non-Goals

**Goals:**
- Add explicit CLI commands for feedback and node/scope management.
- Make `ee disable scope` affect real runtime injection behavior.
- Reuse the existing SQLite state and repositories where possible.
- Keep acknowledgements short and branded as `ExperienceEngine`.

**Non-Goals:**
- Build a full audit log of manual feedback corrections.
- Add interactive prompt flows after every task.
- Introduce a TUI or web UI.
- Implement bulk node management in this change.

## Decisions

### 1. Manual feedback will update node counters directly

`ee feedback --last helped|harmed` and `ee feedback node <id> helped|harmed` will directly update:
- `helped_count` or `harmed_count`
- `last_helped_at` or `last_harmed_at`

Rationale:
- This matches the current aggregate feedback model.
- It avoids needing a new event table before the first management surface exists.
- It is acceptable for manual feedback to act as a reinforcing correction path, not a perfect historical override system.

Alternative considered:
- Add a separate manual feedback event table first.
  - Rejected for now because it adds storage and reconciliation complexity before the CLI control surface exists.

### 2. `--last` feedback targets the most recent injected input record

The command will look up the most recent `experience_input_records` entry that contains injected node ids. It will apply feedback to those nodes as a set.

Rationale:
- This matches the user mental model for “the thing that just happened”.
- It keeps the command fast and local.

Alternative considered:
- Introduce a separate injection-session cursor.
  - Rejected because current `inspect --last` already centers the last input record.

### 3. Node management changes state in-place

The following commands will mutate the target node directly:
- `ee disable node <id>` -> state `retired`
- `ee cool node <id>` -> state `cooling`
- `ee retire node <id>` -> state `retired`

Rationale:
- The current runtime already respects node state through candidate selection.
- Reusing existing state values is lower risk than inventing a separate disable flag.

Alternative considered:
- Add a distinct `disabled` state.
  - Rejected for now because current state machine already has `cooling` and `retired`.

### 4. Scope disable uses the current working directory by default

`ee disable scope` will resolve the current `process.cwd()` into a scope id and persist `is_disabled = true` for that scope. If the scope does not exist yet, the command will create it in disabled form.

Rationale:
- It avoids making users type an internal scope id.
- It matches CLI expectations in local project workflows.

### 5. Runtime gating will short-circuit before intervention

`beforePromptBuild` will resolve the current scope and check whether it is disabled. If it is disabled, the runtime returns `skip` immediately and does not surface an inline notice.

Rationale:
- This makes `ee disable scope` a real product control, not just a stored flag.

## Risks / Trade-offs

- [Manual feedback can reinforce existing automatic counts] → Accept this for the first CLI control surface and document it as a correction/reinforcement path rather than an authoritative override.
- [Disabling a scope by current working directory may surprise users if they run commands from the wrong directory] → Print the resolved scope id and path in the acknowledgement line.
- [Retiring nodes is irreversible in practice without direct DB edits] → Keep `cool` as the lighter-weight option and make retirement acknowledgements explicit.

## Migration Plan

1. Add repository helpers for reading/updating scopes and nodes.
2. Add CLI commands for feedback and management.
3. Wire runtime scope-disable gating.
4. Add tests for command behavior and disabled-scope runtime behavior.
5. Validate with `pnpm check` and OpenSpec strict validation.

## Open Questions

- Whether a future change should add `ee enable scope` for symmetry.
- Whether manual feedback should eventually be backed by an explicit feedback-event table.
