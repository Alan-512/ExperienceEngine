# CLI Help Information Architecture Spec

## Status

Draft for implementation planning.

## Purpose

This spec defines a lightweight UX pass for restructuring ExperienceEngine CLI help around user goals instead of exposing broad command breadth too early.

The goal is not to redesign the whole CLI. The goal is to make the top-level help easier to scan, easier to act on, and more consistent with the current product story:

- host-native installation first
- host-native routine interaction first where supported
- CLI as validation, fallback, maintenance, and advanced operator surface

## Product Principle

The first CLI help screen should answer:

1. How do I get started?
2. How do I see what ExperienceEngine is doing?
3. How do I fix a problem?
4. Where do advanced commands live?

It should not require users to parse a long flat command inventory before they know which path applies to them.

## Goals

1. Reorganize top-level CLI help around user goals instead of raw command breadth.
2. Keep host-native installation and host-native routine interaction priority intact.
3. Make the fallback/operator role of the CLI clearer.
4. Keep advanced commands available without promoting them too early.

## Non-Goals

- redesigning the CLI command set
- removing commands
- changing runtime behavior
- replacing detailed command help for advanced workflows
- introducing a new TUI or standalone UI

## User Problems

### Problem 1: Too Much Breadth Too Early

The current top-level help still exposes a long raw usage line plus a few highlighted first steps.

That is technically accurate, but it still makes the product feel broader and more operator-heavy than it needs to for new or normal users.

### Problem 2: User Goals Are Not The First Organizing Principle

The CLI already has distinct roles:

- onboarding and initialization
- inspection and status
- repair and recovery
- advanced operator workflows

But the help screen does not present those roles as the primary structure.

### Problem 3: Routine Usage Can Still Feel CLI-Centric

After the host-native routine interaction pass, top-level help should reinforce that:

- routine review and feedback belong in the host first for `Codex` and `Claude Code`
- CLI is still important, but mostly as fallback and explicit operator control

## Desired Model

Top-level CLI help should be organized into four user-goal sections:

### 1. Get Started

Examples:

- install the host integration
- initialize shared ExperienceEngine state
- verify that the current host is wired correctly

### 2. See What ExperienceEngine Is Doing

Examples:

- `ee status`
- `ee inspect --last`
- `ee inspect recent injected 10`

### 3. Fix A Problem

Examples:

- `ee doctor <host>`
- `ee repair <host>`
- `ee upgrade <host>`

### 4. Advanced Operator Commands

Examples:

- backup/export/import/rollback
- lifecycle controls
- maintenance operations
- evaluation flows
- config/models

This fourth section can stay compact and can point to deeper command help instead of expanding every command inline.

## Product Language Requirements

Top-level help should clearly communicate:

- installation still follows host-native priority
- routine review/feedback should stay in the host session first when supported
- CLI is the explicit fallback/operator path

Avoid:

- presenting every command as equal-weight
- implying that CLI is the preferred day-to-day path for `Codex` or `Claude Code`
- burying validation and recovery commands inside a single raw usage line with no structure

## Recommended Implementation Shape

1. Keep one compact raw `Usage:` line for completeness.
2. Add short goal-oriented sections above it.
3. Keep the section count small.
4. Use one or two example commands per section instead of broad command dumps.
5. Make advanced breadth discoverable, but not the dominant first impression.

## In-Scope Surfaces

- `src/cli/dispatch.ts`
- `tests/unit/cli-dispatch.test.ts`
- `README.md` only if top-level CLI guidance needs a short alignment pass
- `docs/user-guide.md` only if top-level CLI guidance becomes inconsistent

## Out-Of-Scope Surfaces

- command-specific deep help pages
- `inspect --last` payload layering itself
- host-specific install logic
- runtime MCP prompt surfaces

## Acceptance Criteria

1. Top-level CLI help is organized around user goals.
2. New users can identify a start path without parsing the full usage line first.
3. Routine host-first usage for `Codex` and `Claude Code` remains visible.
4. Validation, repair, and advanced operator paths remain available but do not dominate the first screen.
5. The resulting help output is shorter and easier to scan than a flat command listing.

## Open Decisions For The Implementation Plan

- Whether `inspect --last` should appear in the top-level "See what ExperienceEngine is doing" section or only in command-specific help
- How much of the raw `Usage:` line should remain visible versus deferred to an explicit advanced/help view
- Whether README should mirror the same four goal labels or stay more product-level
