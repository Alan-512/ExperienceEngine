# OpenClaw Matched-Block Campaign V4

Date: `2026-07-16`

Status: accepted real-host repeated campaign; sealed single-scenario publication gate passed

## Purpose

This record closes the repeated-evidence gate that remained open after the immutable one-block v3 pilot.

V4 is a new protocol stratum. It does not append to, overwrite, or pool the retained v1-v3 campaigns.

## Validated Runtime

- ExperienceEngine artifact: independently downloaded ClawHub `0.5.1`
- Artifact SHA-256: `01f6f17005d2edb4db5a0358e284799818fd4cab977fb16604cc5ddaa5eed692`
- OpenClaw: `2026.7.1`
- Host placement: isolated local OpenClaw runs under WSL
- Host model route: `openrouter/tencent/hy3:free`
- Arms per block:
  - `treatment`
  - `forced_holdout`
  - `no_ee`

The campaign used isolated workspace, OpenClaw state, ExperienceEngine home, host session, and artifact roots for every block/arm.

## Sealed Campaign Shape

- Campaign id: `s8-openclaw-pilot-v4-campaign`
- Scenario count: `1`
- Complete repetitions: `5`
- Planned arms: `15`
- Passed preflight records: `75/75`
- Revision-two completed formal attempts: `15/15`
- Complete block dispositions: `5/5`
- Excluded blocks: `0`
- Replacement blocks: `0`
- Infrastructure failures: `0`

All five block manifests and all fifteen arm plans were persisted before the first formal task input was released.

## Arm Evidence

Across all five blocks:

- treatment persisted the sealed-node `inject` decision with `delivery_mode=live` and `delivered=1`
- forced holdout persisted the same `inject` decision with `delivery_mode=holdout` and `delivered=0`
- no-EE contained no ExperienceEngine plugin, extension, database, decision, or delivery evidence

Independent validation checked the formal-start boundary, released task-input digest, workspace result, session binding, injection record, and no-EE isolation for every block/arm.

## Scorecard

| Metric | Result |
| --- | ---: |
| Complete-block coverage | `1.0` |
| Infrastructure reliability | `1.0` |
| Delivery rate | `1.0` |
| Net helpful intervention rate | `1.0` |
| Helpful rate | `1.0` |
| Harmful rate | `0.0` |
| Uncertain rate | `0.0` |
| Treatment minus no-EE task-success delta | `0.4` |
| Treatment minus no-EE old-mistake-avoidance delta | `0.4` |
| Treatment minus no-EE wall-clock latency | `+3776.2 ms` |
| Tool-call delta | `0` |
| Infrastructure failure rate | `0.0` |

Unavailable or incomparable metrics remain explicitly unavailable:

- correct-skip rate
- false-positive injection rate
- provider cost
- ExperienceEngine token overhead

Scorecard evidence digest:

```text
17b60c1314e4d62e5ec7d5b420bc335b8fdb246133c135ebf2b5f4cb3f8c0d7c
```

## Publication Decision

The persisted decision is `publishable` because every sealed threshold passed:

- minimum complete-block coverage
- minimum infrastructure reliability
- minimum repetitions per scenario
- negative-result disclosure
- harmful-rate threshold
- infrastructure-failure-rate threshold

The CLI remains fail closed. Running the report without explicit negative-result disclosure returns `not_publishable`. Supplying `--negative-results-disclosed` reproduces the persisted `publishable` decision and the same scorecard evidence digest.

Example recomputation:

```bash
ee evaluate openclaw-matched-block \
  --campaign-db <campaign-dir>/matched-block-pilot.sqlite \
  --campaign-id s8-openclaw-pilot-v4-campaign \
  --observations <campaign-dir>/observations.json \
  --output-dir <campaign-dir>/cli-report-disclosed \
  --negative-results-disclosed
```

## Claim Boundary

This campaign has one scenario cluster. The configured scenario-cluster confidence method therefore reports a point estimate but cannot produce lower or upper 95% confidence bounds.

The accepted claim is limited to the disclosed, deterministic, single-scenario campaign:

- the matched-block infrastructure remained reliable across five repetitions
- the seeded treatment guidance was delivered as planned
- treatment outperformed no-EE on the sealed task in this campaign

The result does not establish general cross-scenario efficacy, full host support, or production-learning readiness. These flags remain unchanged:

```text
support_claim_allowed=false
production_learning_ready=false
```

## Cleanup

The retained validation runtime contained copied authentication state only for independent artifact inspection. It was deleted after validation. Temporary npm and OpenRouter relays were stopped. The user's existing OpenClaw gateway was not modified or terminated.
