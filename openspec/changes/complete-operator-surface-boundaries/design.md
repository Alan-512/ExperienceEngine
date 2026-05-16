## Context

ExperienceEngine has accumulated several valid interaction paths:

- routine host-first checks and feedback
- CLI fallback inspection
- operator repair/upgrade/review/hygiene/export workflows
- high-impact managed state operations
- advanced maintenance and evaluation commands
- Codex brokered long-tail actions

The functionality exists, but the product surface can read as a flat list of commands and internals. The next pass should make boundaries explicit without breaking compatibility. It should start after the Quality Band inspection model is implemented so the final CLI/MCP wording uses stable trust terminology.

## Goals / Non-Goals

**Goals:**

- Define one shared tier vocabulary for user-facing surfaces.
- Make default CLI help shorter and easier to scan.
- Keep routine workflows host-first where supported.
- Keep operator workflows discoverable and clearly read-only or high-impact as appropriate.
- Mark advanced/experimental commands as advanced.
- Align README, user guide, CLI help, MCP capabilities, and Codex broker action metadata.

**Non-Goals:**

- No command removal.
- No command renaming without aliases or compatibility plan.
- No new dashboard, TUI, or host-native UI.
- No claim that host-native marketplace or ClawHub behavior works unless validated separately.
- No behavior changes to learning, retrieval, injection, or feedback.
- No reinterpretation of operator review, hygiene, or export draft behavior beyond tier labeling and presentation.

## Decisions

1. Treat tiering as metadata and presentation, not command behavior.

   Rationale: users need clearer navigation, not a breaking CLI redesign. Commands keep their current names while help/docs explain when to use them.

   Alternative considered: split commands into new namespaces such as `ee routine` and `ee operator`. Rejected for this pass because it would create migration work without improving core behavior.

2. Use three public tiers.

   Routine:

   - `ee status`
   - `ee doctor <host>`
   - `ee inspect --last`
   - `ee helped` / `ee harmed`
   - host-native routine review and feedback

   Operator:

   - `ee install|upgrade|repair <host>`
   - `ee inspect review`
   - `ee inspect hygiene`
   - `ee inspect export-drafts`
   - package/host validation checks
   - managed backup/export/import/rollback when framed as high-impact operator actions

   Advanced or experimental:

   - `ee maintenance ...`
   - raw evaluations
   - broker internals
   - hybrid diagnostics and developer-only validation commands

   Alternative considered: two tiers, routine and advanced. Rejected because repair/review/export workflows are legitimate product workflows but not daily routine usage.

3. Keep MCP risk and surface tier separate.

   Rationale: a read-only operator review is low risk but not routine for new users; an upgrade is operator-tier and high-impact. Metadata should represent both concepts where needed.

   Alternative considered: reuse existing risk level as the only category. Rejected because risk and intended audience are different axes.

4. Align docs before adding new interaction features.

   Rationale: the next implementation phases will be easier if existing commands are clearly placed. This change is mostly surface hygiene and should not create new product features.

## Risks / Trade-offs

- [Help output becomes too long] -> Default help should show grouped summaries and leave full syntax in a compact command reference.
- [Operator workflows become hidden] -> Include a clearly labeled operator section and examples.
- [Risk and tier wording conflict] -> Use tier for audience/workflow and risk for mutation safety.
- [Docs drift across languages] -> Update English and Chinese READMEs in the same task.
- [MCP callers depend on old category strings] -> Add new tier metadata where possible without removing existing category/risk fields in the first pass.

## Migration Plan

- Keep existing commands and broker action ids.
- Add tier language to help/docs/capability output.
- If structured action metadata changes, keep existing category/risk fields and add tier fields rather than replacing them.

## Open Questions

- Whether managed backup/export/import/rollback should be operator or advanced in docs. Initial plan: operator/high-impact, because they are supported product state workflows, while raw maintenance remains advanced.
