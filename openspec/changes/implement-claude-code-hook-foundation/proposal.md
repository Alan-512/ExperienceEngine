# Change Proposal: Implement Claude Code Hook Foundation

## Why

The multi-agent roadmap is already defined, but the codebase still only has a real installer and runtime entrypoint for OpenClaw. Claude Code is the next highest-value host because it exposes official hooks and project-local settings files.

## What Changes

- Add a Claude Code installer path to `ee install claude-code`
- Generate a project-local Claude settings file with ExperienceEngine hooks
- Add a `claude-hook` CLI entrypoint that captures Claude hook payloads into the ExperienceEngine data home
- Persist Claude Code install state under the shared product data directory

## Scope

This change only establishes hook capture and installation wiring.

It does not yet:
- inject ExperienceEngine hints into Claude Code prompts
- implement Claude Code MCP tooling
- convert Claude hook payloads into full ExperienceEngine intervention decisions
