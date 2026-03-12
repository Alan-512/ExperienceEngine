## Overview

This change adds a real negative-control validation path. The workflow is:

1. Start from a scope that already has a successful `test_debug` experience node.
2. Run a real follow-up task in the same scope but a different task family, such as `build_debug`.
3. Verify that no nodes are injected and that stats remain non-incremented for injected usage.
4. Promote the sanitized payload sequence into replay coverage.

## Decisions

### Skip verification source of truth

Skip behavior is validated from persisted state, not from model prose. A real negative-control run is considered valid when:

- the follow-up input record persists an empty `injected_node_ids_json`, and
- the relevant stats row does not increment `injected_tasks`, and
- the follow-up task resolves to a task family without matching prior nodes.

### Fixture promotion scope

The fixture should preserve the real OpenClaw shape but stay minimal. It only needs the fields required to replay:

- prompt payload and context
- tool result payload and context
- finalize payload and context

## Risks

- A negative-control task may accidentally resolve to the same task family if the prompt wording overlaps too much with existing test-debug nodes.
- If the same scope later accumulates nodes for multiple task families, the fixture may need explicit seeding to keep the skip boundary deterministic.
