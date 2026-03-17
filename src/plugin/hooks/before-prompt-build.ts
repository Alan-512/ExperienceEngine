import type { HostPromptContext } from "../../types/plugin.js";
import type { ExperienceNode, ScopeTaskStats, ToolEvent } from "../../types/domain.js";
import { buildExperienceInput } from "../../input/input-adapter.js";
import { decideIntervention } from "../../controller/intervention-controller.js";

export const handleBeforePromptBuild = (
  context: HostPromptContext,
  nodes: ExperienceNode[] = [],
  stats?: ScopeTaskStats,
  toolEvents: ToolEvent[] = []
) => handleBeforePromptBuildInternal(context, nodes, stats, toolEvents);

const handleBeforePromptBuildInternal = async (
  context: HostPromptContext,
  nodes: ExperienceNode[] = [],
  stats?: ScopeTaskStats,
  toolEvents: ToolEvent[] = []
) => {
  const input = buildExperienceInput(context, toolEvents);
  const decision = await decideIntervention(input, nodes, stats);

  return {
    mode: decision.mode,
    text: decision.text,
    input
  };
};
