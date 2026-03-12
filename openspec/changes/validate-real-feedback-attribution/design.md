## Overview

This change validates the runtime feedback loop against real OpenClaw turns.

1. Start from a scope that already contains an active node eligible for conservative injection.
2. Run a real similar turn that injects and succeeds.
3. Run a real similar turn that injects and fails via a safe command failure.
4. Verify persisted node counters and state transitions.

## Decisions

### Runtime source of truth

Feedback attribution is validated from the persisted `experience_nodes` rows. A turn is considered attributed only when:

- the turn persists non-empty `injected_node_ids_json`, and
- the target node's `usage_count` increments, and
- `helped_count` or `harmed_count` changes consistently with `outcome_signal`.

### Failure task design

The harmful validation uses a safe failing command (`false`) through the existing `exec` tool. This avoids destructive side effects while still producing a real tool failure and a real failed outcome.

## Risks

- If the host model ignores the exact failing command instruction, the turn may not resolve as `failure`.
- Repeated harmful validations can change node state, so the assertions should verify deltas rather than assuming a pristine database.
