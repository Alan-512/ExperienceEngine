# ExperienceEngine

ExperienceEngine v2 MVP scaffold for an OpenClaw companion-layer plugin. The initial repository focuses on a runnable TypeScript skeleton for:

- host input adaptation
- experience extraction and gating
- conservative intervention rendering
- feedback/state updates
- SQLite-backed persistence
- a minimal `ee` CLI for local inspection

## Stack

- Node.js 20+
- TypeScript
- pnpm
- SQLite via `node:sqlite`
- Vitest

## Quick Start

```bash
pnpm install
pnpm check
node dist/cli/index.js stats
```

## Project Layout

```text
src/
  plugin/       OpenClaw-facing hooks and plugin factory
  input/        Host signal normalization into ExperienceInput
  analyzer/     Strategy and warning extraction
  controller/   Trigger evaluation, retrieval, ranking, rendering
  feedback/     Outcome attribution and state transitions
  store/        SQLite, vector and JSONL storage adapters
  cli/          Local control and inspection commands
```

## Current Status

This is an initialization baseline, not a production-complete plugin. The repository now includes:

- typed domain models from the v2 spec
- a SQLite schema and bootstrap path
- OpenClaw plugin manifest + `register(api)` entrypoint
- agent-loop payload normalization for `before_prompt_build`, `tool_result_persist`, and finalize events
- test coverage for task typing, trigger evaluation, rendering, and payload normalization

Next implementation steps should focus on validating the plugin against a real OpenClaw runtime, then replacing heuristic extractors with stronger evidence-aware logic.
