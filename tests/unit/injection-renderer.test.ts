import { describe, expect, it } from "vitest";
import { renderInjection } from "../../src/controller/injection-renderer.js";
import type { ExperienceNode } from "../../src/types/domain.js";

const node = (): ExperienceNode => ({
  id: "node_1",
  node_type: "warning",
  scope_id: "scope_1",
  task_type: "bug_fix",
  trigger_pattern: "fix sqlite issue",
  compact_hint: "Validate the failing migration before changing unrelated schema code.",
  success_signal: "Migration runs cleanly.",
  evidence_summary: "Migration failed twice.",
  source_kind: "system_derived",
  state: "active",
  usage_count: 0,
  helped_count: 0,
  harmed_count: 0,
  support_count: 1,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
});

describe("renderInjection", () => {
  it("renders a compact hints block", () => {
    const output = renderInjection("inject", [node()]);
    expect(output).toContain("Execution hints from prior similar tasks:");
    expect(output).toContain("- Validate the failing migration");
  });
});
