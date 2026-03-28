# Experience Model Overview

ExperienceEngine does not primarily record facts. It records **reusable execution experience**.

That means the system is trying to preserve guidance like:

```text
When this integration test times out, check the fraud-check mock first instead of tuning the connection pool.
```

not just facts like:

```text
This repo uses pnpm.
The user prefers tabs.
```

## What An Experience Node Contains

An experience node usually includes:

- `compact_hint`
  - the shortest reusable guidance for a similar future task
- `trigger_pattern`
  - the kind of task or failure pattern that should match the node
- `goal`
  - what the node is trying to help accomplish
- `recommended_steps`
  - the preferred execution order when the node is mature enough to expand
- `avoid_steps`
  - paths that have already proven wasteful or harmful
- `success_signal`
  - what a successful application of the node should look like
- `evidence_summary`
  - a compact explanation of why the node exists

ExperienceEngine also tracks governance fields such as:

- `state`
  - `candidate`, `active`, `cooling`, `retired`
- `usage_count`
- `helped_count`
- `harmed_count`
- `support_count`
- `origin_record_ids`
- `helped_record_ids`
- `harmed_record_ids`

These fields are what make ExperienceEngine different from a fact-memory system. The system does not just remember a piece of content; it tracks whether that content has earned the right to keep intervening.

## What Gets Injected

ExperienceEngine keeps the default intervention compact. The base unit is the `compact_hint`.

For more mature nodes, ExperienceEngine can expand the injected guidance with structured fields like:

- `Goal`
- `Steps`
- `Avoid`

That expansion is intentionally gated. The system does not dump every stored field into every prompt.

The routing policy is also intentionally asymmetric:

- strong or well-supported candidates should not be skipped just because the current prompt uses different wording
- uncertain but promising same-family matches should prefer conservative injection over a hard skip
- mature low-risk nodes can expand bounded `Goal / Steps / Avoid` guidance even during conservative injection

That same routing now needs to stay explainable in inspection surfaces:

- `ee inspect --last` should say whether the route was normal or conservative
- it should explain why ExperienceEngine acted, not only expose raw gate codes
- it should show a concise trust signal so users can decide whether to lean on the hint
- `ee status` and `ee doctor` should translate recent retrieval health into plain-language operator guidance, not just raw counters

## The Capture And Learning Split

ExperienceEngine now treats task history and reusable experience as two different layers:

```text
task record
  -> learning candidate
  -> active
  -> cooling
  -> retired
```

- every meaningful task can still be recorded as runtime history
- only tasks with transferable decision value should become learning candidates
- wording-only, copy-only, or presentation-only cleanups can remain recorded without being promoted into reusable experience

This split matters because "the task finished successfully" is not the same thing as "the system learned something worth injecting next time."

## The Core Lifecycle

```text
task signals
  -> task record
  -> candidate
  -> active
  -> cooling
  -> retired
```

At a high level:

- broad runtime history is recorded first
- repeated or meaningful signals produce a candidate
- successful reuse or corroboration promotes it into active use
- harmful outcomes reduce confidence
- repeated harm can cool or retire the node

This is a governance lifecycle, not just a storage lifecycle.

## What Kinds Of Experience EE Learns

ExperienceEngine is best at:

- repeated failure -> fix -> success paths
- configuration and routing troubleshooting
- execution order guidance
- expectation correction
  - when a technically valid result is still corrected by the user because the agent solved the wrong problem

Expectation correction is intentionally narrower than a generic rewrite or cleanup:

- it should reflect a changed solution direction, execution order, boundary, or quality bar
- it should not be used for expression-layer refinements like lighter wording, better labels, or cleaner presentation copy

It is not designed to be the primary system for:

- long-term user preferences
- arbitrary repository facts
- emotional feedback
- one-off stylistic requests with no reusable execution value

## Why This Matters

Most memory systems answer:

- what should be remembered
- what context should be recalled

ExperienceEngine answers:

- when should prior experience intervene
- what short execution guidance should be injected
- when a conservative injection is still worth surfacing instead of skipping
- whether that intervention actually helped
- whether the node should stay active, cool down, or retire

That is why the shorthand is:

**Memory does addition. ExperienceEngine does governance.**
