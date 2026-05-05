## Context

Phase 6 introduced repo-level policy state and circuit breaker decisions. The current repo summary can expose the policy fields, and `ee config restore repo-policy` can clear a tripped circuit, but operators still cannot inspect the evidence window that caused the policy state.

This change is the first Phase 7 slice. It turns the Phase 6 policy model into an operator-readable inspection surface. It does not add a new TUI or web console yet; the first durable surface is the existing interaction service and CLI inspect path.

## Goals / Non-Goals

**Goals:**

- Show repo policy state in a way operators can act on.
- Include recent circuit evidence with enough detail to explain whether the circuit came from attribution records or fallback injection events.
- Make restore guidance explicit without making restore automatic.
- Keep all evidence read-only in inspection flows.

**Non-Goals:**

- Add experience hygiene jobs.
- Add export drafts.
- Add team, org, or shared policy controls.
- Build a rich TUI/web console.
- Change repo policy thresholds or diagnostic delivery behavior.
- Delete or rewrite attribution, injection, or review history.

## Decisions

### 1. Extend interaction service first

The interaction service should expose a structured repo policy inspection object before CLI formatting. CLI commands, Codex brokered actions, and future console UI can all reuse the same read model.

Rationale:

- Avoid duplicating SQLite queries in terminal rendering code.
- Keep future MCP/action surfaces aligned with CLI output.

### 2. Inspect recent evidence, not the entire history

The policy inspection should report the same bounded evidence window used by the evaluator: latest delivered or live-diagnostic attribution records plus fallback injection evidence, capped at 20.

Rationale:

- Operators need to understand why the current policy state exists.
- The surface should not look like a general audit log or ledger browser.

### 3. Separate state from restore

Inspection should show whether restore is available and what it will do, but it must not restore automatically. Existing restore remains explicit.

Rationale:

- Circuit breaker tightening is a safety behavior. Clearing it should remain a deliberate operator action.

### 4. Keep console wording product-accurate

The surface should describe automatic attribution as the normal evidence path and manual feedback as override evidence. It should not imply that users must manually score every intervention.

Rationale:

- This preserves the product model from the repo guidance and avoids regressing into a manual scoring UI.

## Risks / Trade-offs

- [Evidence output becomes noisy] -> Cap the evidence list and summarize counts before listing records.
- [CLI output becomes a new product commitment] -> Start with existing inspect surfaces and structured service output, not a separate console app.
- [Restore appears unsafe or magical] -> Show restore command/help text but keep restore as an explicit command.
- [Fallback evidence is misunderstood as canonical attribution] -> Label evidence source as `attribution` or `injection_fallback`.

