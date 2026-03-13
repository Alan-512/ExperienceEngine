## Why

ExperienceEngine now has a strong engine layer and a usable operator layer, but the user-facing CLI interaction layer is still underdefined. In practice, users of OpenClaw, Claude Code, and Codex mostly experience the product inside agent CLIs, not through a web UI. If the product stays invisible, users cannot build trust, understand when intervention happened, or manage bad experiences.

At the same time, agent CLI workflows are sensitive to noise. A good ExperienceEngine CLI surface should not spam the terminal or interrupt every turn. The next design slice should define a low-noise, CLI-native interaction model for visibility, feedback, inspection, and management.

## What Changes

- Define the user-visible CLI interaction layer for ExperienceEngine.
- Specify when the product should surface injection notices and when it should stay silent.
- Specify how users can suppress inline notices without disabling the engine.
- Specify lightweight feedback, inspection, and management commands that fit terminal workflows.
- Define prompt-copy guidelines so future implementation stays consistent across hosts.

## Capabilities

### New Capabilities

- `cli-user-experience-surface`: A low-noise CLI interaction model for ExperienceEngine visibility, feedback, inspection, and management.

## Impact

- Clarifies how users perceive ExperienceEngine in agent CLIs.
- Creates a stable product interaction contract before implementation.
- Rebalances product work toward user trust and controllability rather than only backend behavior.
