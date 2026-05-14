## Context

The architecture roadmap defines "short guidance" as a core product constraint. The current system already supports compact hints and delivery states, so this change should tighten and test existing behavior rather than inventing a new injection framework.

## Goals / Non-Goals

**Goals:**

- Make "one compact hint by default" a tested policy.
- Ensure candidate records and raw task history never reach prompt injection.
- Gate expanded guidance behind mature node status and strong delivery confidence.
- Keep conservative injection compact.

**Non-Goals:**

- Change candidate retrieval scoring.
- Add new memory types.
- Expand MCP tools.
- Remove existing diagnostic details from scorecards.

## Decisions

### Injection policy is separate from retrieval

Retrieval can find and rank candidates, but injection policy decides what reaches the prompt. A retrieved candidate is not automatically injected.

Alternative considered:
- Let high retrieval score directly imply injection. Rejected because retrieval relevance is not the same as delivery safety.

### Conservative delivery only uses compact hints

Conservative injection should stay short even when a node has richer structured fields.

Alternative considered:
- Include avoid steps in conservative mode. Rejected because conservative mode is meant to reduce prompt footprint and risk.

### Expanded rendering is gated

Only mature/high-confidence nodes should render Goal, Steps, Avoid, or Success Signal fields.

For the first implementation, "mature/high-confidence" must be derived from existing fields, not `QualityBand`.

Expanded rendering is allowed only when all required conditions are true:

```text
- node.state is active
- node.delivery_state is eligible
- validation_state is valid or absent with strong historical support
- recent harm does not apply
- scorecard confidence/match band is high enough for inject, not only conservative injection
- intervention mode is inject, not inject_conservative
```

`QualityBand` may be displayed by inspect surfaces, but it must not become the gate for expanded rendering in this change.

Alternative considered:
- Always render structured fields when present. Rejected because early or weak nodes may contain noisy generated structure.

## Risks / Trade-offs

- [Useful detail may be hidden] -> Keep expanded rendering available behind maturity and confidence gates.
- [Snapshots become brittle] -> Snapshot only policy-relevant content boundaries, not incidental whitespace.
- [Existing tests may assume multiple hints] -> Update tests only where policy changes are intentional.
