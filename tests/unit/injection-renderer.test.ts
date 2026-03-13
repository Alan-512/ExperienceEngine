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
  retrieval_text: "fix sqlite issue\nValidate the failing migration before changing unrelated schema code.",
  source_kind: "system_derived",
  origin_record_ids: [],
  helped_record_ids: [],
  harmed_record_ids: [],
  state: "active",
  usage_count: 0,
  helped_count: 0,
  harmed_count: 0,
  support_count: 1,
  last_used_at: undefined,
  last_helped_at: undefined,
  last_harmed_at: undefined,
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
