export const CODEX_EXPERIENCEENGINE_INSTRUCTION_START =
  "<!-- EXPERIENCEENGINE:CODEX-INSTRUCTION START -->";
export const CODEX_EXPERIENCEENGINE_INSTRUCTION_END =
  "<!-- EXPERIENCEENGINE:CODEX-INSTRUCTION END -->";

export const renderCodexExperienceEngineInstruction = (): string =>
  [
    "## ExperienceEngine workflow",
    "Use ExperienceEngine as a runtime learning loop for meaningful coding and debugging tasks.",
    "- Call `experienceengine_lookup_hints` once near task start before making changes.",
    "- Use `experienceengine_record_tool_result` only for important tool outcomes that changed the task direction, and keep tool summaries concise.",
    "- Call `experienceengine_finalize_task` before finishing each meaningful task so ExperienceEngine can persist the outcome. If the task did not materially change after lookup, omit `prompt` and send only a concise `contextSummary` when useful.",
    "- Use `experienceengine_quick_feedback` only when ExperienceEngine actually injected guidance and it clearly helped or harmed."
  ].join("\n");
