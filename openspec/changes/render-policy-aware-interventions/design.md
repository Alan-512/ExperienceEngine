## Context

This change depends on `add-intervention-strength`. The renderer should consume the strength derived by the controller. The same strength is also persisted in scorecards, but scorecard construction currently happens after controller rendering in the runtime path, so the renderer must not depend on parsing scorecard JSON.

## Goals / Non-Goals

**Goals:**
- Make injected prompt text explain how to use the guidance.
- Keep diagnostic hints explicitly non-authoritative.
- Keep hard constraints explicit and rare.
- Preserve compact rendering and existing structured guidance expansion rules.

**Non-Goals:**
- Add diagnostic candidate retrieval.
- Add new node lifecycle states.
- Include full scorecards in prompts.
- Change OpenClaw, Claude Code, or Codex host-specific delivery contracts.

## Decisions

### 1. Renderer uses strength, not raw scorecard internals

The renderer will receive strength directly, rather than parsing the entire scorecard.

Rationale:
- The controller owns decision semantics.
- The renderer should only translate decision semantics into prompt text.

### 2. Diagnostic hint language must be explicit

Diagnostic hints must include language equivalent to:

```text
Use this only as a diagnostic lead. First verify whether the same signal exists in the current task. Do not treat it as a required fix.
```

Rationale:
- The first-use value comes from changing investigation order, not from forcing a fix.

### 3. Prompt context stays small

The renderer may include scope, risk, confidence, or verification hints when available, but should not include the full scorecard or runner-up diagnostics.

Rationale:
- The product value is targeted behavior steering.
- Context pollution is one of the risks the governance layer must control.

## Risks / Trade-offs

- [Policy text may become too long] → Keep templates short and test output length/shape.
- [Hard constraints may sound too absolute] → Only use hard-constraint template when strength is explicitly hard.
- [Older call sites may not pass strength] → Preserve the old generic titles as fallback behavior.

## Implementation Plan

1. Update `renderInjection` signature to accept optional strength.
2. Add template selection by strength.
3. Keep structured step expansion behavior gated by maturity and mode.
4. Wire controller call sites to pass diagnostics strength.
5. Add renderer and integration tests for each strength.
