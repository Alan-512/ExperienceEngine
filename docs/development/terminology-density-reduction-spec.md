# Terminology Density Reduction Spec

## Status

Draft for implementation planning.

## Purpose

This spec defines a lightweight UX pass for reducing visible terminology density in ordinary ExperienceEngine output.

The goal is not to remove internal concepts from the product.
The goal is to make default user-facing surfaces lead with product-language explanation and only expose raw system terms when the user is explicitly in a deeper or expert context.

## Product Principle

Default output should answer:

1. What is happening?
2. What should I do next?
3. Is this trustworthy?

Only after that should the product expose internal system labels.

## Goals

1. Reduce the amount of raw internal terminology shown in default output.
2. Keep internal terms available in verbose, operator, or expert contexts.
3. Apply this pass only to the highest-traffic surfaces.
4. Improve readability without hiding meaningful behavior.

## Non-Goals

- renaming the internal data model
- removing terms from code, schema, or tests that need them
- rewriting every document in the repository
- changing retrieval, learning, or lifecycle behavior

## Problem

ExperienceEngine already explains itself much better than before, but some internal terms still appear too early in normal user-facing output.

Examples:

- `conservative injection`
- `cooling`
- `priority candidate`

These concepts are legitimate, but in the default path they should usually appear only after a human-readable explanation, or stay in verbose/operator surfaces.

## Scope

This pass should focus on high-traffic default surfaces only:

- `ee status`
- `ee doctor`
- default `ee inspect --last`

It may also include a small doc alignment pass in:

- `README.md`
- `docs/user-guide.md`

if the wording there still over-surfaces internal system language in the main path.

## Out Of Scope

- `ee inspect --last --verbose`
- `inspect node`
- `inspect repo`
- raw operator/evaluation reports
- development and design docs

Those surfaces can keep more direct system terminology because they already act as advanced or operator-facing contexts.

## Desired Output Pattern

### Default mode

Use:

- product-language explanation first
- internal term second only when needed

Examples:

- instead of leading with `conservative injection`, lead with:
  - `ExperienceEngine found a plausible match and used a smaller, cautious intervention.`
- instead of leading with `cooling`, lead with:
  - `This experience is being used more cautiously because recent evidence weakened confidence.`
- instead of leading with `priority candidate`, lead with:
  - `This experience is still gathering validation before normal reuse.`

### Verbose or expert mode

Verbose/operator surfaces may still show:

- `inject_conservative`
- `cooling`
- `priority_candidate`
- gate reasons
- decision reasons

The important point is that those terms should not be the first thing a normal user has to parse.

## Recommended Implementation Shape

1. Audit the default strings in `status`, `doctor`, and default `inspect --last`.
2. Replace front-loaded internal labels with short product-language explanations.
3. Keep the raw term only where:
   - it is required for operator clarity, or
   - it already sits behind verbose/deep inspection
4. Avoid broad rewording outside the targeted surfaces.

## Acceptance Criteria

1. Default `status`, `doctor`, and `inspect --last` read more naturally to a non-operator.
2. Internal labels are still available where users deliberately go deeper.
3. The product does not become vague or hand-wavy; it still explains what changed and why.
4. This pass stays narrow and does not become a repository-wide terminology rewrite.

## Open Decisions For The Implementation Plan

- Whether `status` and `doctor` should keep some parenthetical raw labels after the human-readable explanation
- Whether README/user-guide need explicit examples of the new preferred product-language phrasings
