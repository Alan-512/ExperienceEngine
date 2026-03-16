# OpenClaw High-Confidence Scenarios

Use this workflow when the baseline snapshot is too cold to say anything useful about candidate creation, distillation quality, or repeated-task intervention.

## Purpose

The `high-confidence` pack gives ExperienceEngine a small, repeatable set of real OpenClaw tasks that:

- normalize the repo root explicitly
- stay read-only
- cover repeated `test_debug` and `build_debug` families
- generate artifacts that map session ids back to records, candidates, jobs, and injected nodes

OpenClaw remains the current baseline host for this stage.

## Command

```bash
ee evaluate openclaw-scenarios --pack high-confidence --repo-root /mnt/d/project/experienceengine
```

Optional flags:

```bash
ee evaluate openclaw-scenarios --pack high-confidence --repo-root /mnt/d/project/experienceengine --output-dir ./artifacts/evaluations/openclaw/high-confidence-latest
ee evaluate openclaw-scenarios --pack high-confidence --repo-root /mnt/d/project/experienceengine --dry-run
```

## Outputs

The runner writes local-only artifacts under:

```text
artifacts/evaluations/openclaw/<timestamp>/
```

Artifacts include:

- `scenario-results.json`
- `scenario-results.md`
- `raw/*.json`
- `baseline/summary.json`
- `baseline/summary.md`

## What The Pack Covers

- repo-root sanity
- repeated `test_debug` verification
- repeated `build_debug` verification

The repeated pairs are there to make second-turn injection observable after candidate creation and distillation.

## Interpretation Notes

- `recordsMatched < total scenarios` usually means the host ran but ExperienceEngine did not persist a matching session record.
- `scenariosWithCandidates = 0` after repeated successful tasks usually means the current candidate gate is too narrow or the task evidence is still too weak.
- `scenariosWithDistilledCandidates = 0` means the async distillation chain is not yet producing final nodes for that pack.
- `scenariosWithInjectedNodes > 0` on the second repeated task family is the main positive signal for this phase.
