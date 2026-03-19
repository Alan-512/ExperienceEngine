# Compiler Target Selection Guide

Use this guide when deciding which Experience Pack compiler target should be used for a repository.

The goal is to reduce guesswork around:

- `agents`
- `codex`
- `claude`
- `github`

Choose the smallest target that matches the host and workflow you actually use.

## Quick Rule

Start with the host you are actively using:

- using `Codex` -> prefer `codex`
- using `Claude Code` -> prefer `claude`
- using a generic agent workflow or mixed local tooling -> prefer `agents`
- using GitHub custom agent/profile workflows -> prefer `github`

If more than one target is useful, compile more than one. Do not assume one target replaces every other target.

## Target Summary

### `agents`

Produces:

- `AGENTS.md`

Best for:

- generic agent-facing project guidance
- mixed local tooling
- repositories where you want one broad instruction file

Choose this when:

- you want the most host-neutral output
- you want one repo-root file that is easy to inspect manually

### `codex`

Produces:

- `CODEX.md`

Best for:

- Codex-centered day-to-day work
- repositories where Codex is your main active host

Choose this when:

- the main real usage path is Codex
- you want Pack guidance rendered specifically for Codex-facing consumption

### `claude`

Produces:

- `CLAUDE.md`

Best for:

- Claude Code-centered work
- repositories where Claude Code is a first-class supported host

Choose this when:

- Claude Code is part of the real workflow
- you want a repo-root Claude-specific instruction file

### `github`

Produces:

- `<pack-id>.agent.md`

Best for:

- GitHub custom agent/profile-style workflows
- repositories where agent artifacts are expected under `.github/agents/`

Choose this when:

- the target workflow is explicitly GitHub-agent oriented
- you want a target-specific asset rather than a generic repo-root instruction file

## Recommended Defaults

For the current product phase:

- if you actively use `Codex`, start with `codex`
- if you actively use `Claude Code`, add `claude`
- if you want one broad fallback artifact, also compile `agents`
- only add `github` when you truly need a GitHub-specific artifact

That means a common local setup looks like:

- primary target: `codex`
- secondary fallback: `agents`

## Deployment Paths

Current default destinations:

- `agents` -> `<repo>/AGENTS.md`
- `codex` -> `<repo>/CODEX.md`
- `claude` -> `<repo>/CLAUDE.md`
- `github` -> `<repo>/.github/agents/<pack-id>.md`

## Recommended Decision Order

When unsure, decide in this order:

1. Which host do I actually use on this repository?
2. Do I need a host-specific artifact or a generic one?
3. Will this file live at repo root or under `.github/agents/`?
4. Do I need one target or two complementary targets?

## Common Patterns

### Pattern 1: Codex-first local repo

Use:

- `codex`
- optionally `agents`

### Pattern 2: Claude-first local repo

Use:

- `claude`
- optionally `agents`

### Pattern 3: Mixed local usage

Use:

- `agents`
- plus the host-specific target you actually use most often

### Pattern 4: GitHub-oriented export

Use:

- `github`

Add `agents` only if you also want a repo-root generic instruction file.

## Things To Avoid

Avoid these anti-patterns:

- compiling every target by default without a real consumer
- treating `github` as a generic replacement for `agents`
- using host-specific targets when there is no real host workflow for them
- deploying multiple root-level instruction files without a reason

## Minimal Examples

```bash
ee pack compile auth-debug-pack codex
ee pack compile auth-debug-pack agents
ee pack compile auth-debug-pack claude
ee pack compile auth-debug-pack github
```

Use this guide together with:

- [docs/development/real-repo-usage-template.md](real-repo-usage-template.md)
- [docs/development/case-study-template.md](case-study-template.md)
