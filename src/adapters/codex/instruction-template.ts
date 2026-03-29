export const CODEX_EXPERIENCEENGINE_INSTRUCTION_START =
  "<!-- EXPERIENCEENGINE:CODEX-INSTRUCTION START -->";
export const CODEX_EXPERIENCEENGINE_INSTRUCTION_END =
  "<!-- EXPERIENCEENGINE:CODEX-INSTRUCTION END -->";

export const renderCodexExperienceEngineInstruction = (): string =>
  [
    "## ExperienceEngine workflow",
    "Use ExperienceEngine for meaningful coding and debugging tasks.",
    "- Call `experienceengine_lookup_hints` once near task start before making changes.",
    "- In Codex, ask what ExperienceEngine just injected and ask why it matched in-session before CLI fallback.",
    "- If injected guidance clearly helped or harmed the task, mark the guidance as helped or harmed in-session with `experienceengine_feedback_last` before CLI fallback.",
    "- Use `experienceengine_record_tool_result` only for important tool outcomes that changed the task direction, and keep tool summaries concise.",
    "- Call `experienceengine_finalize_task` before finishing each meaningful task. Skip it for lightweight wording-only, Q&A, or no-op turns. When useful, omit `prompt` and send only a concise `contextSummary`."
  ].join("\n");
