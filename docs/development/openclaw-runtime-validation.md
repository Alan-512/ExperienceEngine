# OpenClaw Runtime Validation

This document defines the developer workflow for validating ExperienceEngine against a real local OpenClaw runtime.

## Goal

Use a local OpenClaw development environment to:

1. observe real plugin event payloads
2. capture representative payload samples
3. sanitize and promote those samples into canonical fixtures
4. replay the promoted fixtures inside this repository

The repository does not require a live OpenClaw runtime for CI. Live runtime validation is a developer workflow whose outputs are checked in as fixtures.

## When To Run This Workflow

Run runtime validation when:

- OpenClaw lifecycle payloads change
- ExperienceEngine starts relying on new host fields
- a replay test fails because the real host shape drifted
- you observe a payload shape not covered by `tests/fixtures/openclaw/`

## Host Input Classification

### Guaranteed Inputs

- current request text or task summary equivalent
- tool result persistence events
- session or scope context sufficient to derive a stable session key

### Inferred Inputs

- `outcome_signal`
- whether a task is finished
- harm/help attribution
- task type classification

### Optional Inputs

- context summary
- compaction summary
- sub-agent summaries
- explicit completion or error events

## Local Validation Loop

1. Load the plugin into a local OpenClaw development environment.
2. Exercise a targeted coding/debugging task that should trigger `before_prompt_build`, `tool_result_persist`, and a finalize-capable event.
3. Capture the raw event payloads for the smallest representative flow.
4. Sanitize them before they enter the repository.
5. Promote the sanitized payloads into `tests/fixtures/openclaw/`.
6. Run replay validation locally and ensure `pnpm check` stays green.

## Copied Plugin Installs

If OpenClaw is loading ExperienceEngine from `~/.openclaw/extensions/experienceengine` instead of directly from the repository root:

1. treat that copied install as the real runtime source of truth
2. keep the copied tree synchronized with the package you are validating
3. make sure the install root and key plugin files are not world-writable

`ee doctor openclaw` now reports `install_drift` when the copied bundle no longer matches the current package, and it will recommend `ee repair openclaw` when drift is detected.

## Capturing Payloads

Preferred approach:

1. log raw payloads from a local OpenClaw dev runtime into a temporary local directory outside the repository
2. save one JSON file per observed event
3. keep the capture minimal; only preserve the event data needed to reproduce parser behavior

Recommended capture set:

- one prompt-build payload
- one tool-result payload
- one finalize-capable payload
- one replay prompt payload that should trigger conservative injection

## Promoting Payloads Into Fixtures

1. Place the raw JSON capture somewhere outside the repository.
2. Sanitize it:

```bash
pnpm tsx scripts/openclaw/promote-runtime-payload.ts /path/to/raw-payload.json
```

3. Curate the resulting structure into a scenario file under `tests/fixtures/openclaw/`.
4. Add or update replay assertions in `tests/integration/plugin-runtime.test.ts`.

## Replaying A Fixture

Run the local harness against a fixture:

```bash
pnpm tsx scripts/openclaw/replay-runtime-fixture.ts tests/fixtures/openclaw/scenario-message-object.json
```

The script prints:

- input/node/stats counts
- the replayed `prependContext` block, if any

## Acceptance Criteria

- the promoted fixture is sanitized
- the fixture shape still resembles the real OpenClaw payload
- replay produces the expected persistence and injection behavior
- `pnpm check` passes after fixture and test updates
