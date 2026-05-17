export const CODEX_EXPERIENCEENGINE_INSTRUCTION_START =
  "<!-- EXPERIENCEENGINE:CODEX-INSTRUCTION START -->";
export const CODEX_EXPERIENCEENGINE_INSTRUCTION_END =
  "<!-- EXPERIENCEENGINE:CODEX-INSTRUCTION END -->";

export const renderCodexExperienceEngineInstruction = (): string =>
  [
    "## ExperienceEngine workflow",
    "Use ExperienceEngine for meaningful coding and debugging tasks.",
    "- Call `experienceengine_lookup_hints` once near task start.",
    "- In Codex, ask what ExperienceEngine just injected and ask why it matched in-session before CLI fallback.",
    "- If guidance clearly helped or harmed, mark the guidance as helped or harmed in-session with `experienceengine_feedback_last` before CLI fallback.",
    "- autonomous hygiene governance is automatic; inspect governance status, guarded actions, or legacy approvals in-session.",
    "- Use `experienceengine_record_tool_result` for important tool outcomes; keep tool summaries concise.",
    "- Call `experienceengine_finalize_task` before finishing each meaningful task. Skip it for lightweight wording-only, Q&A, or no-op turns. When useful, omit `prompt`."
  ].join("\n");
