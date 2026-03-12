## Context

Warning node ids are currently derived from `compact_hint`, and `compact_hint` includes the failing tool name. This makes otherwise equivalent warnings diverge into multiple node ids, which weakens support counts and blocks the new metadata-refresh path from repairing older warning nodes.

## Goals / Non-Goals

**Goals:**
- Canonicalize warning hints so stable ids do not fragment by tool-specific failure source.
- Preserve concrete failure-source context somewhere non-keyed.
- Add regression coverage for warning-node convergence.

**Non-Goals:**
- Canonicalize strategy node ids.
- Rewrite historical nodes in bulk outside the normal refresh path.
- Change warning injection policy beyond key stability.

## Decisions

### Use a generic warning hint as the stable key surface

`compact_hint` for warnings will always use a generic phrasing anchored to the debug loop rather than the specific tool name. This preserves the existing stable-id scheme while making future warning refreshes land on the same warning node id.

### Keep failure-source detail in evidence summary

The failing tool name still matters for human context, so it will remain in `evidence_summary` instead of the id-driving hint text. That preserves diagnostic detail without fragmenting ids.

## Risks / Trade-offs

- [Warning hints become less tool-specific] → Keep tool-specific evidence in `evidence_summary`.
- [Old fragmented warning nodes remain until a new refresh occurs] → Accept for now; future refreshes will converge on the canonical warning node.
