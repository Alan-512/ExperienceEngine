# Inspect Last Layering Spec

## Status

Draft for implementation planning.

## Purpose

This spec defines a lightweight UX pass for splitting `ee inspect --last` into:

- a concise default view for everyday review
- a verbose view for retrieval and routing diagnostics

The goal is to make the default surface easier to scan without removing the deeper operator information that already exists.

## Product Principle

`ee inspect --last` should answer everyday questions first:

1. What happened?
2. Why did ExperienceEngine act?
3. Can I trust it?
4. What should I do next?

It should not force everyday users to parse retrieval diagnostics before they understand the intervention.

## Goals

1. Keep the default `ee inspect --last` output short and product-facing.
2. Preserve the full diagnostic surface behind an explicit verbose mode.
3. Avoid widening this pass into `inspect node` or `inspect repo`.
4. Reduce terminology density in the default path without hiding advanced information from operators.

## Non-Goals

- redesigning `inspect node`
- redesigning `inspect repo`
- changing runtime scorecard generation
- changing retrieval or intervention behavior
- introducing a new review UI

## Current Problem

`ee inspect --last` is much better than before, but it still mixes two different jobs:

1. daily review of the latest intervention
2. operator diagnosis of routing and retrieval behavior

That makes the default output denser than it needs to be.

Examples of fields that are useful but too detailed for the default view:

- `Top candidate score`
- `Score margin`
- `Fast path applied`
- `Query rewrite applied`
- `Gate reason`
- `Decision reason`
- full scorecard reason lists

Those fields are still valuable, but they are better suited to an explicit verbose view.

## Proposed Model

### Default: `ee inspect --last`

The default view should keep:

- session
- scope
- task type
- intervention
- route mode
- automatic feedback
- injected node short summary
- hints
- recommendation
- why ExperienceEngine acted
- trust summary
- a short retrieval summary if it reads naturally

The default view should avoid detailed scorecard diagnostics unless they are the only way to explain the outcome.

### Verbose: `ee inspect --last --verbose`

Verbose mode should include the full diagnostic layer now shown by default, including:

- top candidate score
- score margin
- fast path applied
- query rewrite applied
- promotion signal
- priority promotion applied
- merge decision
- merge reason
- top candidate detail
- gate reason
- decision reason
- full scorecard reasons
- retrieval notes

This should behave like an explicit operator or expert mode, not a separate command family.

## Command Shape

Recommended shape:

- `ee inspect --last`
- `ee inspect --last --verbose`

Optional alias if needed later:

- `ee inspect --last --deep`

This pass should implement one explicit advanced flag only. Do not introduce multiple overlapping variants in the same slice.

## Product Language Requirements

Default mode should prefer:

- explanation first
- trust guidance second
- system detail later or omitted

Verbose mode may expose:

- raw system terms
- deeper routing language
- full scorecard context

This preserves operator visibility without forcing it into the everyday path.

## In-Scope Files

- `src/cli/commands/inspect.ts`
- `tests/unit/inspect-command.test.ts`
- `src/cli/dispatch.ts` only if top-level usage/help needs a tiny alignment note

## Out-Of-Scope Files

- `src/interaction/service.ts`
- `src/adapters/codex/mcp-server.ts`
- `src/cli/commands/status.ts`
- `src/cli/commands/doctor.ts`

Unless implementation reveals a hard blocker, this pass should stay inside the inspect command layer.

## Acceptance Criteria

1. `ee inspect --last` is shorter and easier to scan than the current default output.
2. The default output still explains:
   - what happened
   - why it happened
   - whether the result is trustworthy
3. `ee inspect --last --verbose` restores the current deep routing and scorecard diagnostics.
4. No meaningful operator detail is lost; it is only moved behind the explicit verbose flag.
5. `inspect node` and `inspect repo` remain unchanged in this pass.

## Open Decisions For The Implementation Plan

- Whether `retrievalNotes` belong in default mode when they are short and human-readable
- Whether `--deep` should be added now as an alias or left for a later polish pass
- Whether the CLI usage/help text needs one short mention of `--verbose` in this same slice
