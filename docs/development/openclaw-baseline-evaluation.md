# OpenClaw Baseline Evaluation

Use this workflow to generate a repeatable OpenClaw-first baseline snapshot for the v3 learning loop.

If the baseline remains too cold to say anything meaningful about candidate creation or repeated-task intervention, use the higher-signal companion workflow:

- [docs/development/openclaw-high-confidence-scenarios.md](openclaw-high-confidence-scenarios.md)

## Preconditions

- `openclaw` CLI is installed and the gateway can load `experienceengine`
- `ee doctor openclaw` reports a healthy host wiring state
- the current local ExperienceEngine database already contains OpenClaw task data

## Command

```bash
ee evaluate openclaw-baseline
```

Optional flags:

```bash
ee evaluate openclaw-baseline --lookback-hours 168
ee evaluate openclaw-baseline --output-dir ./artifacts/evaluations/openclaw/manual-run
```

## Outputs

By default, ExperienceEngine writes local-only artifacts to:

```text
artifacts/evaluations/openclaw/<timestamp>/
```

Each snapshot contains:

- `summary.json`
- `summary.md`

## What The Snapshot Covers

- input record totals and outcome distribution
- injection coverage
- candidate lifecycle distribution
- distillation job status distribution
- node state and feedback distribution
- latest observed record / candidate / node pointers

## How To Use It In The Current WSL Baseline

1. Run one or more real OpenClaw tasks in the current workspace.
2. Run:

```bash
ee doctor openclaw
ee evaluate openclaw-baseline
```

3. Record the generated snapshot path.
4. Compare later snapshots after distiller/profile/gating changes.

## Interpretation Notes

- This snapshot is a baseline, not a trend report.
- Injection coverage being high is not automatically good.
- A growing discarded candidate count usually means either the gate is too wide or the distiller profile needs work.
- OpenClaw is the current baseline host. Claude Code and Codex remain regression or reuse hosts for this stage.
