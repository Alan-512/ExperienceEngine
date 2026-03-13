## Context

The current inspect surface supports:
- `ee inspect --last`
- `ee inspect active`
- `ee inspect recent`
- `ee inspect recent injected [limit]`
- `ee inspect node <id>`

The next practical improvement is filtering the node inventory itself. This is primarily for users who need to review:
- only warning nodes
- only retired/cooling/candidate nodes

## Goals / Non-Goals

**Goals:**
- Add state-based node filtering
- Add type-based node filtering
- Reuse the current table shape for list output

**Non-Goals:**
- Add multiple simultaneous filters in one command
- Add free-text search
- Change the output to a different rendering style

## Decisions

### 1. Filters are separate command forms

The command forms will be:
- `ee inspect state <state>`
- `ee inspect type <type>`

Rationale:
- They are clear in a terminal and do not require a full option parser.

### 2. Valid values are restricted to known enums

Accepted states:
- `candidate`
- `active`
- `cooling`
- `retired`

Accepted types:
- `strategy`
- `warning`

Invalid forms return a short usage line.

## Risks / Trade-offs

- [Users may later want combined filters] → Accept for now; the first need is to cut down the list, not to build a full query language.
- [The default node list remains broad] → Accept because filtered views are additive and do not break existing usage.
