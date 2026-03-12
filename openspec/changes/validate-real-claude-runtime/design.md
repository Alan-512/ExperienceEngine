## Context

Claude Code differs from OpenClaw in one important way for ExperienceEngine: hooks are invoked as separate short-lived processes. The current implementation already accounts for that with disk-backed session state, but the assumptions about actual hook payload fields and event ordering still need to be proven against the real Claude CLI.

## Goals / Non-Goals

**Goals:**
- Define a repeatable workflow for validating ExperienceEngine against a real local Claude Code CLI run.
- Capture real Claude hook payloads and preserve them as sanitized fixtures.
- Ensure the Claude replay path is backed by both a live validation run and deterministic fixture-based tests.

**Non-Goals:**
- Running Claude Code in CI.
- Implementing Claude-side prompt injection in this change.
- Adding Codex support in this change.

## Decisions

- Reuse the existing Claude hook installer and capture directories rather than introducing a separate validation adapter.
- Treat live Claude runtime validation as a developer workflow whose output is checked in as fixtures.
- Keep replay tests deterministic by replaying curated captured payloads rather than invoking Claude during automated test runs.

## Risks / Trade-offs

- Claude payloads may vary by CLI version, so fixtures need to preserve version context and structure.
- Real validation depends on a local authenticated Claude CLI environment, so not every machine will be able to reproduce it automatically.
- Sanitization must preserve the event structure closely enough that replay remains representative.
