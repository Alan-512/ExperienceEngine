## Context

The learning gate now writes `learning_status` and `learning_reason` onto task runs, and candidates/nodes already track lifecycle, provenance, and helped/harmed feedback. Existing `status` and `doctor` surfaces show retrieval health, but they do not summarize learning admission quality.

The immediate need is release-safe observability: operators should know whether the learner is rejecting mostly ordinary or expression-only tasks, how many recorded tasks become candidates, whether generic advice is being filtered, and whether delivered guidance receives helped/harmed feedback. This should use existing records so the feature can ship as a narrow patch release.

## Goals / Non-Goals

**Goals:**

- Derive learning-quality metrics from existing SQLite tables.
- Keep the first surface concise enough for `ee status` and `ee doctor <host>`.
- Make metrics scope-aware so they reflect the current repo.
- Provide enough signals to decide whether a later Quality Band model has trustworthy inputs.

**Non-Goals:**

- No new database table or migration.
- No change to candidate admission, distillation, retrieval, injection, or feedback writeback behavior.
- No numeric scoring model for Quality Band.
- No new dashboard, TUI, or host-native UI.

## Decisions

1. Add a derived `ExperienceLearningQualityHealth` object to the interaction service.

   Rationale: `ExperienceInteractionService` already owns read-only inspection aggregation and has access to task runs, candidates, nodes, injection events, and attribution records. Keeping this there avoids duplicating SQL across CLI commands.

   Alternative considered: add repository-level aggregate methods for every metric. Rejected for this slice because the initial metrics can be derived from existing list/count APIs, and repository APIs should only be expanded where performance or reuse demands it.

2. Classify learning rejection reasons by stable reason-code substrings.

   Rationale: the gate persists stable reason codes inside human-readable reasons. A derived classifier can group reasons such as `expression-layer refinement`, `no_transferable_execution_value`, `insufficient_substantive_evidence`, and LLM/rule fallback failures without changing persisted data.

   Alternative considered: add a normalized `learning_reason_code` column. Rejected for this patch because it would require migration and backfill; it can be revisited if reason grouping becomes a hard API.

3. Surface metrics in existing status/doctor flows.

   Rationale: users already run these commands for readiness and health. Learning quality belongs next to retrieval health, not in a separate first-release command.

   Alternative considered: add `ee inspect learning-quality`. Deferred; it may be useful after the operator surface consolidation work defines routine vs operator vs advanced command placement.

## Risks / Trade-offs

- Reason grouping may miss new reason wording -> keep an `other` bucket and report top raw reasons.
- Counting all scoped candidates against recent task runs may produce a coarse admission rate -> label it as recent recorded-task admission, not model precision.
- Status output may become noisy -> keep a compact summary in default output and leave deeper tables for future inspect/operator surfaces.
