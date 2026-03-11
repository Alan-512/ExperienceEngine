## Context

ExperienceEngine currently validates plugin behavior through synthetic replay of curated payload shapes. That is a useful compatibility floor, but it is not yet a true development-runtime loop. The next step is to define how real OpenClaw payloads are sampled, sanitized, promoted into canonical fixtures, and replayed without coupling the repository to a live gateway for every test run.

## Goals / Non-Goals

**Goals:**
- Define a repeatable workflow for capturing real OpenClaw payloads from a local development runtime.
- Keep replay tests deterministic by curating sanitized fixture files instead of hitting a live gateway in CI.
- Ensure future host-shape changes are expressed first as fixture updates and then as parser/runtime changes.

**Non-Goals:**
- Running a full OpenClaw gateway inside automated CI right now.
- Building production-grade telemetry or remote payload collection.
- Replacing the current baseline plugin capability spec.

## Decisions

- Add a new OpenSpec capability, `openclaw-runtime-validation`, rather than overloading the baseline plugin capability.
- Treat real payload capture as an offline developer workflow whose outputs are checked in as sanitized fixtures.
- Keep integration replay as the executable contract in CI; live runtime verification remains a developer harness concern.
- Require every new real-world host payload shape to land with both a fixture and a replay test assertion.

## Risks / Trade-offs

- Fixture curation adds maintenance overhead, but it is still cheaper than debugging runtime breakage after host changes land.
- Sanitizing real payloads may remove useful context if done carelessly, so the workflow must preserve structural fidelity while stripping sensitive data.
- A developer-only harness provides weaker guarantees than full live-runtime CI, but it is the right complexity level for the current MVP phase.
