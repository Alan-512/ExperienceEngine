import { describe, expect, it } from "vitest";
import {
  renderCodexExperienceEngineInstruction
} from "../../src/adapters/codex/instruction-template.js";

describe("Codex instruction template", () => {
  it("renders a short workflow-oriented instruction block", () => {
    const text = renderCodexExperienceEngineInstruction();

    expect(text.length).toBeGreaterThan(80);
    expect(text.length).toBeLessThan(800);
    expect(text).toContain("experienceengine_lookup_hints");
    expect(text).toContain("experienceengine_record_tool_result");
    expect(text).toContain("experienceengine_finalize_task");
    expect(text).toContain("experienceengine_quick_feedback");
    expect(text).toContain("ask what ExperienceEngine just injected");
    expect(text).toContain("ask why it matched");
    expect(text).toContain("mark the guidance as helped or harmed in-session");
    expect(text).toContain("CLI fallback");
    expect(text).toContain("keep tool summaries concise");
    expect(text).toContain("meaningful coding and debugging tasks");
    expect(text).toContain("before finishing each meaningful task");
    expect(text).toContain("Skip it for lightweight wording-only, Q&A, or no-op turns");
    expect(text).toContain("omit `prompt`");
    expect(text).not.toMatch(/pack|compiler|AGENTS\.md|CLAUDE\.md|CODEX\.md/i);
  });
});
