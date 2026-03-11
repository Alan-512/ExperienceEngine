## Overview

This change validates the product's critical second-turn behavior against a real OpenClaw gateway. The workflow remains conservative:

1. Run a real seed task that creates at least one experience node.
2. Run a real similar follow-up task in the same scope.
3. Verify injection indirectly through persisted input records, injected node ids, and updated stats.
4. Promote the real captured payload sequence into sanitized fixtures and replay coverage.

## Decisions

### Injection verification source of truth

The primary source of truth is persisted plugin state, not user-visible prose. Real injection is considered validated when:

- the follow-up turn persists non-empty `injected_node_ids_json`, and
- the corresponding stats row increments `injected_tasks`, and
- the turn remains in the expected scope and task family.

### Fixture promotion scope

Only payloads needed to preserve real host-shape compatibility are promoted. Captures are sanitized before promotion, and replay tests should target the minimum viable sequence needed to reproduce the host behavior.

## Risks

- Real model routing may choose a different behavior and avoid the intended task family unless the prompt is constrained tightly.
- Host payloads may continue to omit session context on tool persistence, so finalize-time recovery remains part of the validated contract.
