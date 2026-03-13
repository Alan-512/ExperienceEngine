## Context

The current inspect surface already supports:
- `ee inspect --last`
- `ee inspect active`
- `ee inspect recent`
- `ee inspect node <id>`

The next useful increment is not search or paging. It is a minimal extension that lets users:
- trim the recent list to a desired size
- focus only on injected turns

## Goals / Non-Goals

**Goals:**
- Support a numeric limit for `ee inspect recent`
- Support an injected-only filter for `ee inspect recent`
- Keep parsing simple and predictable

**Non-Goals:**
- Add arbitrary field filtering
- Add pagination tokens
- Change output format away from a table

## Decisions

### 1. `recent` will accept optional positional flags

The command will support:
- `ee inspect recent`
- `ee inspect recent injected`
- `ee inspect recent 20`
- `ee inspect recent injected 20`

Rationale:
- This keeps the CLI lightweight without introducing a full option parser.

### 2. The injected-only filter is semantic, not text-based

The filter will operate on `injected_node_ids.length > 0`, not on the rendered intervention label.

Rationale:
- It directly matches the stored record semantics.

## Risks / Trade-offs

- [Positional parsing is less explicit than long flags] → Keep the accepted forms small and document them via command usage.
- [Users may expect `skip` filtering next] → Accept for now; injected-only is the highest-value filter.
