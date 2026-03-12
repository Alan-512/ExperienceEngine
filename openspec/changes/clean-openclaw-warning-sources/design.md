## Context

Real host inspection shows two ExperienceEngine-owned warning sources:

1. `plugins.load.paths` still contains development roots for ExperienceEngine, so OpenClaw scans world-writable source directories even though the plugin is now installed from `~/.openclaw/extensions/experienceengine`.
2. The copied install under `~/.openclaw/extensions/experienceengine` preserved `777` modes on source files, which also triggers OpenClaw's world-writable-path checks.

These are both host hygiene issues introduced by the ExperienceEngine install flow, so the product should clean them automatically.

## Goals / Non-Goals

**Goals:**
- Remove stale ExperienceEngine development roots from `plugins.load.paths`.
- Normalize copied install permissions for ExperienceEngine under the OpenClaw extensions directory.
- Keep the cleanup logic focused on ExperienceEngine-owned state.

**Non-Goals:**
- Repair third-party plugin warnings such as duplicate `feishu`.
- Redesign doctor parsing.

## Decisions

### Filter only ExperienceEngine-owned load paths

Install/repair will inspect existing `plugins.load.paths` and remove entries that resolve to an ExperienceEngine package root. Other plugin load paths stay untouched.

### Normalize copied install permissions recursively

After a copied install, ExperienceEngine will normalize the installed extension tree:
- directories to `755`
- files to `644`

This is sufficient for the plugin source tree and removes the world-writable warning in the copied install.

## Risks / Trade-offs

- [Filtering load paths too broadly could remove unrelated dev plugins] → Only remove paths that identify as ExperienceEngine package/plugin roots.
- [Permission normalization could be too strict for future executable assets] → Keep the scope limited to the current source-tree install and revisit if executable assets are introduced.

## Implementation Plan

1. Add helper functions to parse `plugins` config JSON, identify ExperienceEngine load paths, and compute a filtered path list.
2. Add recursive permission normalization for the installed OpenClaw extension tree.
3. Wire both cleanup steps into install/repair.
4. Add tests for path filtering and permission normalization.
