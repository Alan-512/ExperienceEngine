# Selective Sync LLM Second Opinion

## Goal

Add a narrow synchronous LLM second-opinion gate before live injection for high-risk cases only.

## Scope

- Default off.
- Trigger only for risky live decisions:
  - top node is `conservative_only`
  - top node has harm history
  - top candidate margin is close
  - expectation-correction style context
- LLM returns constrained output only:
  - `allow`
  - `allow_conservative`
  - `skip`
  - optional `best_node_id`
- LLM never mutates lifecycle or delivery state directly.

## Non-Goals

- No posttask writeback changes.
- No lifecycle or quarantine mutation from sync LLM output.
- No broad hot-path rollout for every intervention.

## Config

- `syncSecondOpinionMode`: `disabled | selective`
- `syncSecondOpinionModel`: optional model override, otherwise reuse distiller model

## Hook Point

- `src/controller/intervention-controller.ts`
- Apply after retrieval/ranking/uncertainty routing selects a live intervention candidate, before final injection text is rendered.

## First-Phase Behavior

1. Compute the normal deterministic intervention decision.
2. If sync second opinion is disabled, return the deterministic result unchanged.
3. If enabled but the case is not high-risk, return the deterministic result unchanged.
4. If enabled and high-risk:
   - call the provider-backed second-opinion gate
   - if decision is `skip`, suppress injection
   - if decision is `allow_conservative`, downgrade to conservative single-hint delivery
   - if decision is `allow`, keep the current plan
   - if `best_node_id` is valid, narrow selection to that node only
5. If the provider call fails or returns invalid JSON, fall back to the deterministic result.

## Diagnostics

Extend intervention diagnostics with:

- `secondOpinionApplied`
- `secondOpinionDecision`
- `secondOpinionReason`
- `secondOpinionTrigger`

## Tests

- config default and env override
- second-opinion gate provider parsing and fallback
- intervention controller skip override
- intervention controller conservative downgrade override
- deterministic fallback when provider is unavailable
