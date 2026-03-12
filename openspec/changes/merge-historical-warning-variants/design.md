## Context

The codebase now generates canonical warning nodes and refreshes candidate metadata correctly, but the existing SQLite state still contains pre-fix warning variants keyed by tool-specific hints. Those variants are no longer correct, yet they remain visible in the database and can dilute support counts unless they are explicitly merged and retired.

## Goals / Non-Goals

**Goals:**
- Provide a repeatable maintenance path for merging historical warning variants into the canonical warning node.
- Aggregate counts and preserve the strongest canonical warning node as the single active warning for a scope/task family.
- Retire duplicate warning variants instead of deleting them, so historical references remain intact.

**Non-Goals:**
- Rewrite historical `experience_input_records`.
- Introduce automatic migrations that run on every plugin startup.
- Clean up non-warning node families.

## Decisions

### Use an explicit maintenance script instead of automatic startup migration

Historical cleanup is a one-off operator action, not part of normal runtime behavior. A script keeps the change auditable, repeatable, and safe to dry-run before touching the real SQLite state.

### Retire duplicates instead of deleting them

Retiring duplicate warning rows removes them from candidate retrieval while preserving historical ids that may still appear in old input records or captures. The canonical warning node receives the merged counters and cleaned metadata.

## Risks / Trade-offs

- [A cleanup run could merge the wrong warnings] → Scope the merge to warning nodes that canonicalize to the same scope/task/hint identity and provide a dry-run mode first.
- [Historical duplicate rows remain visible in raw SQL output] → Accept; they are explicitly retired and no longer influence retrieval.
- [Future schemas might need similar cleanup logic for other node types] → Keep this script warning-specific for now and generalize only if another real problem appears.
