## Context

Phase 7 now has repo policy inspection and experience hygiene review. Export drafts are the next operator loop: they should help a user decide what learned guidance is ready to carry into an external instruction file, skill, or documentation surface without ExperienceEngine doing that write automatically.

The repo already has managed backup/export snapshots in `ExperienceStateArtifactService`; this change is different. Snapshot export copies managed state for backup/restore workflows, while export drafts summarize selected experience as reviewable guidance.

## Goals / Non-Goals

**Goals:**

- Produce bounded, structured export drafts for selected experience nodes.
- Include provenance, evidence, scope, applicability, risk, hygiene context, and advisory recommended target type.
- Support filters by scope, node id, node type, task family, lifecycle state, delivery state, severity/risk, and limit.
- Expose drafts through operator inspection surfaces.
- Keep all output review-only and non-mutating.

**Non-Goals:**

- Automatically write `AGENTS.md`, `CLAUDE.md`, skills, plugins, team packs, or external docs.
- Publish or synchronize guidance to a team/org store.
- Change node lifecycle, delivery state, attribution, review events, or repo policy.
- Replace managed backup/export/import snapshots.

## Decisions

### 1. Use a pure draft builder

Create `src/maintenance/experience-export-drafts.ts` as a pure builder over nodes, hygiene findings, attribution/provenance evidence, and filters.

Rationale:

- Keeps the feature reviewable and testable.
- Prevents accidental coupling to lifecycle writeback.

### 2. Drafts are review packages, not executable actions

Each draft should contain a stable id, node ids, scope id, task family, guidance text, evidence summary, provenance refs, risk notes, hygiene notes, and suggested target type.

The first-pass suggested target type enum is advisory and local-only:

- `instruction_note`
- `repo_guidance`
- `skill_candidate`
- `documentation_note`
- `do_not_export`

Rationale:

- Operators need enough context to accept/rewrite/reject exported guidance.
- Suggested targets are advisory, not mutation payloads.
- `do_not_export` gives the builder a conservative output for high-risk or low-readiness guidance without mutating node state.

### 3. Start from nodes, not raw candidates

The first pass should draft from formal nodes only. Raw candidates can appear as context when hygiene findings point to duplicates, but they should not become export drafts until promoted/distilled.

Default exportable nodes should be active/eligible or otherwise validated by reuse/evidence. Nodes that are cooling, conservative-only, priority candidates, or otherwise lower-readiness may appear only when explicitly selected or filtered and must carry risk notes. Retired, quarantined, or clearly harmed nodes are excluded by default unless an explicit diagnostic filter asks for them.

Rationale:

- Formal nodes have compact guidance and lifecycle/delivery metadata.
- This avoids exporting noisy pre-distillation candidates.
- Readiness defaults prevent export drafts from becoming a back door around delivery-state governance.

### 4. CLI/MCP surfaces stay read-only

Expose the first CLI surface as `ee inspect export-drafts`, plus a read-only Codex resource and brokered inspect action.

Rationale:

- This matches the repo policy and hygiene slices.
- It preserves the separate state snapshot export command semantics.

## Risks / Trade-offs

- [Drafts imply authority] -> Label every output as review-only and avoid executable mutation payloads.
- [Confusion with snapshot export] -> Keep naming and help text clear: state export snapshots are not guidance export drafts.
- [Noisy guidance exports] -> Default to active/eligible or validated nodes, downgrade high-risk drafts to `do_not_export`, and include hygiene/risk notes.
- [Premature team feature] -> Keep target types advisory and local; no team/org workflow in this change.
