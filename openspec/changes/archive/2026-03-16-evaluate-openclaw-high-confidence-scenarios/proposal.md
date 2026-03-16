## Why

The existing OpenClaw baseline snapshot proves that the evaluation pipeline works, but the first real WSL snapshot is still too cold to say anything meaningful about candidate creation, async distillation, or second-turn intervention. ExperienceEngine needs a repeatable high-confidence scenario pack that runs against the real OpenClaw host and produces comparable learning-loop evidence after each gating or distillation change.

## What Changes

- Add a curated OpenClaw high-confidence scenario pack for the current WSL baseline workspace.
- Add an evaluation runner that can execute the scenario pack through the real `openclaw agent` CLI, capture raw host outputs, and write structured per-scenario artifacts.
- Add a scenario report that links OpenClaw session ids to ExperienceEngine records, candidate lifecycle state, distillation jobs, and injected nodes.
- Document how to use the scenario pack as the primary OpenClaw-first inner-loop validation workflow for v3 tuning.

## Capabilities

### New Capabilities
- `openclaw-scenario-evaluation`: Defines the high-confidence scenario pack, execution workflow, and per-scenario learning-loop reporting for OpenClaw-first evaluation.

### Modified Capabilities

## Impact

- Affected code: `src/evaluation/**`, `src/cli/commands/evaluate.ts`, `src/cli/index.ts`, SQLite-backed reporting utilities, and developer evaluation docs.
- Affected systems: real WSL OpenClaw runtime, local artifacts under `artifacts/evaluations/openclaw/`, and OpenClaw-first validation workflow.
- No public API breaking changes; this adds a new evaluation command and local-only artifacts.
