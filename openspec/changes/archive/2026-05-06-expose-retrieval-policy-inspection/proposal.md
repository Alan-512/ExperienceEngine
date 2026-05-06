# Change: Expose retrieval policy inspection

## Why

Phase A-C made retrieval policy staged, lexical-first, and policy-enrichment components inspectable in stored scorecards. Operators still need a stable CLI/MCP surface that explains those fields without scraping prompt text or digging through raw JSON.

## What Changes

- Add an inspection summary for retrieval-policy diagnostics on the latest intervention.
- Surface stage outcomes, semantic rerank/backfill mode, top candidate policy components, and rejection reason codes through existing inspect flows.
- Keep output additive and behavior-neutral: no scoring, gating, retrieval, delivery, or prompt text changes.

## Impact

- Affected spec: `experience-retrieval-policy`
- Affected code:
  - `src/interaction/service.ts`
  - `src/cli/commands/inspect.ts`
  - `src/adapters/codex/mcp-server.ts`
  - focused unit tests for inspect/explain output
