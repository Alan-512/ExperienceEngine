## Context

ExperienceEngine has already completed host integration, MCP-native interaction, and local state management across OpenClaw, Claude Code, and Codex. The main product risk is no longer wiring; it is learning quality. The current core loop still relies on placeholder extraction templates, placeholder vector plumbing, exact scope/task filtering, coarse outcome attribution, and non-transactional finalize writes.

This change is cross-cutting:
- analyzer output changes
- retrieval and ranking behavior changes
- task typing and outcome resolution change
- feedback attribution changes
- SQLite persistence behavior changes
- inspect/MCP explainability payloads expand
- manual authoring becomes real rather than scaffold-only

The implementation needs to improve core quality without destabilizing the already-working host adapters.

## Goals / Non-Goals

**Goals:**
- Make stored experience meaningfully task-specific rather than fixed proverbs with minimal variation.
- Introduce a real semantic retrieval path behind the existing candidate pipeline.
- Reduce false `failure` and false `harmed` attribution caused by intermediate-step or environmental noise.
- Expand task coverage so non-debug coding work can still participate in the engine through a general fallback path.
- Make finalize persistence atomic enough to avoid partial-write drift.
- Add enough node provenance and attribution detail to support later debugging, inspect, and MCP explanation surfaces.
- Turn user-authored experience into a real supported workflow.

**Non-Goals:**
- Reworking host adapter registration or installation flows.
- Building a full UI; this change only improves underlying data and surfaces already present.
- Introducing a cloud dependency or centralized service.
- Solving global/shared experience rollout across projects in the first implementation slice.

## Decisions

### 1. Replace fixed extractors with evidence-driven structured extraction

The current extractor layer is too static to validate the product claim. We will replace it with structured extraction that uses task summary, task family, terminal tool sequence, error signatures, and resolved outcome to produce differentiated candidates.

Decision:
- Keep extraction local to ExperienceEngine.
- Support two extraction modes behind one interface:
  - rule-enhanced extraction as the baseline path
  - optional LLM-assisted extraction as a later pluggable path

Why:
- Rule-enhanced extraction can ship first without introducing provider dependencies.
- A pluggable interface preserves room for later higher-quality extraction if local heuristics plateau.

Alternatives considered:
- Keep current template-based extraction and only improve retrieval: rejected because low-quality candidates would still poison the index.
- Make LLM extraction mandatory: rejected because it would turn a local product into a provider-dependent product too early.

### 2. Introduce real semantic retrieval behind a retrieval abstraction

The current "vector" layer is a placeholder, and candidate retrieval is exact filtering. We will add a retrieval abstraction that:
- produces semantic embeddings from normalized task text
- stores/query embeddings through a real vector backend or equivalent local ANN implementation
- combines semantic similarity with scope/task-family heuristics

Decision:
- Preserve scope-local priority.
- Add task-family flexibility rather than requiring exact task-type equality.
- Retrieve candidates in two stages:
  1. semantic candidate shortlist
  2. score/rank with scope, task-family, state, and recent quality signals

Why:
- This keeps project-local relevance strong while removing the current brittle exact-match behavior.

Alternatives considered:
- Expand Jaccard/keyword matching only: rejected because it still fails on semantically similar but lexically different tasks.
- Global retrieval first, scope later: rejected because it would increase noisy cross-project leakage before quality controls are strong enough.

### 3. Split terminal outcome attribution from intermediate tool noise

Current outcome resolution marks the whole task as failed if any intermediate tool fails. This is too coarse for iterative coding loops.

Decision:
- Build a terminal-evidence resolver that prioritizes:
  - explicit final host message signals when strong enough
  - last significant tool result rather than any tool result
  - terminal verification commands above exploratory commands
- Maintain `unknown` when the system lacks enough confidence.

Why:
- Preserving `unknown` is better than over-claiming failure and poisoning feedback.

Alternatives considered:
- Final natural-language message always wins: rejected because agent phrasing is not reliable enough on its own.
- Any non-zero exit code means failure: rejected because exploratory commands routinely use non-zero exit codes.

### 4. Make harm attribution relevance-aware

`harmed` should mean that injected experience plausibly contributed to a bad outcome, not just that injection and failure co-occurred.

Decision:
- Add lightweight relevance-aware harm attribution that distinguishes:
  - environmental failures
  - exploratory/intermediate failures
  - task-terminal failures plausibly related to the injected node's task family, trigger, or recommended path
- Keep the initial implementation heuristic rather than causal-model heavy.

Why:
- This sharply reduces false retirement without blocking on a full causal model.

Alternatives considered:
- Continue using co-occurrence only: rejected because it over-penalizes active nodes.
- Delay all harm attribution until manual user confirmation: rejected because the engine needs automatic feedback to remain useful.

### 5. Replace `unknown` task discard with a general coding fallback

Today many real coding tasks fall out of the system entirely. We will extend the matcher set and add a `general` fallback task family.

Decision:
- Keep existing specific task families.
- Add broader families such as `feature_add`, `refactor`, and `performance` if the implementation supports them cleanly.
- At minimum, replace total discard with a `general` path that can still extract, retrieve, and inject conservatively.

Why:
- This increases coverage without forcing overconfident specialization.

Alternatives considered:
- Keep dropping unknown tasks: rejected because it leaves too much real work outside the engine.

### 6. Make finalize persistence transactional

Finalize currently updates multiple tables separately.

Decision:
- Introduce a database transaction wrapper for finalize writes that covers:
  - scope update
  - input record
  - stats
  - candidate persistence
  - feedback updates
  - injection/audit records where applicable

Why:
- Prevents partial state drift on timeout or crash.

Alternatives considered:
- Leave writes independent and rely on replay: rejected because replay is not guaranteed in all host flows.

### 7. Extend explainability through origin and attribution metadata

Inspect and MCP surfaces need more than current summary fields to support debugging and trust.

Decision:
- Add node provenance fields such as origin record ids and attribution references.
- Expose them through existing inspect/resource payloads without redesigning the interaction model.

Why:
- This gives developers and users a way to understand why a node exists and why it cooled or retired.

### 8. Turn manual experience authoring into a first-class flow

`ee remember` is currently scaffold-only.

Decision:
- Implement manual experience creation against the real node storage model.
- Support at least one authoring path through CLI fallback.
- Extend MCP interaction later to use the same authoring service.

Why:
- Manual experience is the most practical cold-start complement to system-derived learning.

## Risks / Trade-offs

- **[Embedding dependency or runtime cost]** → Keep the embedding backend behind a narrow abstraction and ship a local-compatible default first.
- **[Semantic retrieval may surface noisy candidates]** → Preserve scope-local weighting and enforce conservative thresholds during the first rollout.
- **[Improved extraction may still overfit to shallow tool signals]** → Add extraction-focused test fixtures and require candidate diversity assertions.
- **[Outcome and harm heuristics can still be wrong]** → Prefer `unknown` over false certainty and add explicit environmental-failure filtering early.
- **[Schema changes can complicate migration]** → Use additive columns where possible and ship migrations with backwards-compatible readers.
- **[Manual authoring may create low-quality nodes]** → Keep authored nodes explicit in provenance and inspect surfaces so they remain debuggable.

## Migration Plan

1. Add schema changes for node provenance, retrieval metadata, and any new task-family/state fields.
2. Introduce transactional finalize writes while preserving current repository interfaces.
3. Land improved outcome/task/harm logic behind tests before changing extractor behavior.
4. Replace extractor placeholders and candidate retrieval once attribution and persistence are stable.
5. Backfill inspect/MCP payloads with new explainability fields.
6. Replace `remember` scaffold with real manual node creation.
7. Re-run host-level validation on OpenClaw, Claude Code, and Codex after the new core logic lands.

## Open Questions

- Which local embedding backend gives the best trade-off between installation complexity and retrieval quality for this repository?
- Should global/shared experience promotion stay out of this change entirely, or should the schema leave room for it now?
- How much of authored experience should be available immediately over MCP in the same rollout versus a later follow-up?
