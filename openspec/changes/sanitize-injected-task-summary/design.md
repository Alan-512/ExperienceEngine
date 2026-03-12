## Context

Real finalize payloads can echo ExperienceEngine's own prepended hint block back into the message content. Today `buildExperienceInput()` strips host timestamp tags, but it does not strip ExperienceEngine-authored headings such as `Execution hints from prior similar tasks:` or `Conservative execution hints:`. As a result, persisted `task_summary` and downstream `trigger_pattern` fields can be contaminated by previously injected guidance instead of staying anchored to the user task.

## Goals / Non-Goals

**Goals:**
- Remove ExperienceEngine-authored injected hint blocks before task summaries are built.
- Keep the sanitization logic deterministic and shared across prompt normalization and finalize persistence paths.
- Add regression coverage that reflects real finalize payloads containing injected hint text.

**Non-Goals:**
- Re-score or rewrite existing stored nodes in SQLite.
- Change injection rendering text or node ranking policy.
- Introduce generic host-side prompt cleaning beyond ExperienceEngine's own headings.

## Decisions

### Sanitize at text-normalization time

Task-summary cleaning will live in `src/utils/text.ts` and be applied from `buildExperienceInput()`. This keeps the behavior centralized and automatically covers prompt-build, finalize, replay, and hook-based code paths without duplicating cleanup logic inside runtime adapters.

Alternative considered:
- Clean only inside `normalizePromptPayload()`: rejected because finalize and hook fallback paths can still assemble summaries outside that single adapter.

### Only strip ExperienceEngine-owned heading blocks

The sanitizer will remove a leading block that starts with either of the current injection headings and ends before the preserved user request. This keeps the cleanup narrow and avoids accidentally deleting arbitrary host or user-authored content.

Alternative considered:
- Broadly strip any leading bullet list or system-like preface: rejected because it risks deleting legitimate user prompts.

## Risks / Trade-offs

- [Stored historical nodes remain polluted] → This change only prevents new contamination; old nodes can be cleaned in a later migration-style change if needed.
- [Heading strings may evolve later] → Keep the sanitizer tied to the renderer's current headings and extend tests when render text changes.
- [Host payloads may interleave hints and user text differently] → Cover the known real finalize shape in regression tests and expand the sanitizer only when new real samples justify it.
