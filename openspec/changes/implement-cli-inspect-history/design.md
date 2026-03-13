## Context

The current inspect surface covers:
- `ee inspect --last`
- `ee inspect active`

That is enough for “what just happened?” and “what is active now?”, but not enough for historical review or node-level debugging. The next useful CLI step is:
- a compact recent history view
- a detailed single-node view

This should stay read-only and avoid turning inspect into a noisy audit dump.

## Goals / Non-Goals

**Goals:**
- Add a compact recent history listing for recent input records.
- Add a richer node detail view for a single experience node.
- Keep output human-readable in plain terminal flows.

**Non-Goals:**
- Add filtering, paging, or search in this change.
- Build a TUI or export format.
- Add mutating behavior to inspect.

## Decisions

### 1. `recent` will default to a small fixed window

`ee inspect recent` will show the most recent 10 input records by default.

Rationale:
- It keeps output readable in a terminal.
- It avoids adding parameter parsing before the basic surface exists.

### 2. `node <id>` will print labeled fields, not a table

Single-node inspection needs full detail, so it will render as labeled lines and short lists rather than a one-row table.

Rationale:
- Tables work well for collections, not for long per-node metadata.
- It makes fields like recommended steps and evidence summary readable.

### 3. The first version remains read-only

Inspect commands should not mix with management actions in this change.

Rationale:
- It keeps inspect predictable and safe.
- Management is already available through dedicated commands.

## Risks / Trade-offs

- [Recent output may still get long if evidence strings are verbose] → Keep the row shape compact and avoid dumping all evidence in the list view.
- [Users may expect paging or counts] → Accept for now; this change is about baseline inspectability, not full audit tooling.
