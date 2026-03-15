# OpenClaw Core Validation Checklist

ExperienceEngine v3 keeps multiple supported hosts, but **OpenClaw is the core-learning validation baseline**.
Use this checklist whenever candidate capture, async distillation, or governance behavior changes.

## Preconditions

- `openclaw` CLI is installed and the local gateway can load `experienceengine`
- `ee doctor openclaw` reports the plugin wiring as healthy
- Distillation environment variables are configured if remote LLM distillation should be exercised

## Core Learning Baseline

1. Run a supported OpenClaw task that produces a successful candidate.
2. Confirm `experience_input_records` gets a new record immediately after finalize.
3. Confirm `experience_candidates` gets a new row with `lifecycle_state = pending`.
4. Confirm `distillation_jobs` gets a pending job for the same candidate.
5. Drain the distillation queue or wait for auto-drain.
6. Confirm the candidate becomes `distilled`.
7. Confirm a formal `experience_nodes` row is created or updated.
8. Confirm `before_prompt_build` can retrieve the distilled node on the next similar task.

## Failure / Retry Baseline

1. Force the distiller to fail.
2. Confirm `retry_count` increments on both candidate and job.
3. Confirm the candidate moves to `failed` before retry exhaustion.
4. Confirm the candidate moves to `discarded` once retry budget is exhausted.
5. Confirm discarded candidates do not appear in normal inspect or intervention surfaces.

## Governance Baseline

1. Run a successful injected follow-up task.
2. Confirm the injected node increments `usage_count` and `helped_count`.
3. Run a failed injected follow-up task with a relevant failure signature.
4. Confirm the injected node increments `harmed_count`.
5. Confirm node state transitions still behave as expected (`active -> cooling -> retired`).

## Host Reuse Regression

After OpenClaw passes the core baseline:

- Run `ee doctor claude-code`
- Run `claude mcp get experienceengine`
- Run `ee doctor codex`
- Run `codex mcp get experienceengine`

These follow-up checks are regressions only. They do not replace the OpenClaw baseline.
