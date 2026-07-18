# OpenClaw Multi-Scenario Campaign V5

Date: `2026-07-17`

Status: accepted independently validated three-scenario directional campaign; not publishable as general efficacy evidence

## Purpose

This record closes the Phase 0.5C residual scenario-coverage gate with one complete matched three-arm block for each sealed scenario class:

- applicable guidance injection;
- correct skip with a plausible record-only distractor;
- delivered harm followed by production-governed recovery.

V5 is a new immutable campaign stratum. It does not repair, resume, overwrite, or pool the retained failed v2-v4 campaigns.

## Validated Artifact And Host

- Published channel: npm
- Package: `@alan512/experienceengine@0.5.2`
- Exact artifact filename: `alan512-experienceengine-0.5.2.tgz`
- Artifact size: `1245199` bytes
- Artifact SHA-256: `6fe2cc3e69adda56186bafb0b0bd6565cb3b605f89334597d5402dbef745e9b1`
- OpenClaw: `2026.7.1`
- Node: `22.21.0`
- Platform: `linux-x64`
- Model route: `openrouter/tencent/hy3:free`

Every ExperienceEngine arm installed through native `npm:@alan512/experienceengine@0.5.2` semantics. The failed v4 local-archive dependency shortcut was not reused.

## Sealed Campaign Shape

- Campaign id: `phase-0.5c-openclaw-multi-scenario-v5`
- Plan digest: `be526d64edc8ad77d7ad77024e76fd7d414229db321df0119725fb7c140a0251`
- Scenario clusters: `3`
- Repetitions per scenario: `1`
- Planned blocks: `3`
- Planned arms: `9`
- Revision-two completed formal attempts: `9/9`
- Complete block dispositions: `3/3`
- Excluded blocks: `0`
- Infrastructure failures: `0`
- Arm evidence records: `9/9`

All block manifests and arm plans were persisted before formal task input release. No replacement block or partial rerun was used.

## Scenario Evidence

### Inject

- treatment delivered the applicable sealed guidance;
- forced holdout retained the intervention decision while suppressing delivery;
- no-EE contained no ExperienceEngine database or plugin evidence.

### Correct skip

- the sealed plausible distractor was retained as candidate evidence;
- treatment and forced holdout delivered zero interventions;
- the deterministic task succeeded;
- correct-skip evidence coverage and correct-skip rate were both `1.0`;
- false-positive injection rate was `0.0`.

### Harm recovery

The treatment arm independently proved the complete causal sequence:

1. `harm_exposure`
   - selected `multi-scenario-harm-node-v5`;
   - delivered one conservative intervention;
   - deterministic exposure task recorded `task_success=0`;
   - recorded one harmed intervention;
   - bound production attribution `attr_ca734b12e83e`;
   - bound production review evidence `review_7540193f-6d49-4ef4-bed7-55964bc5a774`;
   - transitioned the node from `conservative_only` to `quarantined` through `authority_source=production_runtime`.
2. `recovery_recheck`
   - ran in a fresh host session;
   - delivered zero interventions;
   - excluded the quarantined node through governance evidence;
   - completed the deterministic recovery task successfully.

The independent validator reopened the retained treatment SQLite database and verified the attribution, review, governance, no-EE absence, and runtime/session bindings.

## Scorecard

| Metric | Result |
| --- | ---: |
| Complete-block coverage | `1.0` |
| Infrastructure reliability | `1.0` |
| Delivery rate | `0.5` |
| Helpful rate | `0.5` |
| Harmful rate | `0.5` |
| Correct-skip rate | `1.0` |
| Correct-skip evidence coverage | `1.0` |
| False-positive injection rate | `0.0` |
| Harm-recovery opportunity count | `1` |
| Harm-recovery success count | `1` |
| Harm-recovery rate | `1.0` |
| Infrastructure failure rate | `0.0` |

Scorecard evidence digest:

```text
73e2047e9efa3a05e279c50dbf0e15150e94e3f22896934c95f24357614cf1c8
```

Campaign evidence SHA-256:

```text
1565332ea4a44f00d1312778a66bbe21d96dccdddca015108a80dc77cab8a014
```

Independent validation digest:

```text
68ffdbb6ad6d218dc9c6d19d7709c88676d527b7317fb8f2a72e4c5b5cd741f0
```

## Publication Decision And Claim Boundary

The persisted and independently recomputed decision is `not_publishable`.

This is expected for the sealed directional campaign:

- one repetition per scenario does not satisfy the publication plan's minimum of five;
- the deliberately harmful treatment exposure makes the campaign harmful-rate threshold fail;
- the campaign was designed to prove instrumentation, correct-skip measurement, and causal harm recovery, not general positive efficacy.

The accepted Phase 0.5C claim is limited to the exact scenarios above. It proves that the multi-scenario harness can measure applicable delivery, valid skip behavior, false-positive delivery, delivered harm, production feedback, quarantine, and fresh-session recovery against an immutable published npm artifact.

It does not authorize a general efficacy, full support, or production-learning-readiness claim:

```text
support_claim_allowed=false
production_learning_ready=false
```

## Cleanup

The retained runtime was used only for independent validation. After validation:

- copied authentication/runtime state was deleted;
- temporary npm and OpenRouter relays were stopped;
- ports `4885` and `4886` were verified closed;
- no campaign, plugin-install, agent, or Gateway child process remained.
