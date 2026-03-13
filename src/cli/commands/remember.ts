import { loadConfig } from "../../config/load-config.js";
import { ExperienceInteractionService } from "../../interaction/service.js";
import type { ExperienceNode, TaskType } from "../../types/domain.js";

const TASK_TYPES: TaskType[] = [
  "bug_fix",
  "build_debug",
  "test_debug",
  "integration_fix",
  "feature_add",
  "refactor",
  "performance",
  "general"
];
const NODE_TYPES: ExperienceNode["node_type"][] = ["strategy", "warning"];

type ParsedRememberArgs = {
  cwd?: string;
  triggerPattern?: string;
  hint?: string;
  taskType?: TaskType;
  nodeType?: ExperienceNode["node_type"];
  goal?: string;
  applicability?: string;
  successSignal?: string;
  recommendedSteps: string[];
  avoidSteps: string[];
};

const parseRememberArgs = (raw: string[]): ParsedRememberArgs | null => {
  const parsed: ParsedRememberArgs = {
    recommendedSteps: [],
    avoidSteps: []
  };

  for (let index = 0; index < raw.length; index += 1) {
    const value = raw[index];
    const next = raw[index + 1];

    switch (value) {
      case "--cwd":
        parsed.cwd = next;
        index += 1;
        break;
      case "--trigger":
        parsed.triggerPattern = next;
        index += 1;
        break;
      case "--hint":
        parsed.hint = next;
        index += 1;
        break;
      case "--task":
        if (!next || !TASK_TYPES.includes(next as TaskType)) {
          return null;
        }
        parsed.taskType = next as TaskType;
        index += 1;
        break;
      case "--type":
        if (!next || !NODE_TYPES.includes(next as ExperienceNode["node_type"])) {
          return null;
        }
        parsed.nodeType = next as ExperienceNode["node_type"];
        index += 1;
        break;
      case "--goal":
        parsed.goal = next;
        index += 1;
        break;
      case "--applicability":
        parsed.applicability = next;
        index += 1;
        break;
      case "--success":
        parsed.successSignal = next;
        index += 1;
        break;
      case "--step":
        if (!next) {
          return null;
        }
        parsed.recommendedSteps.push(next);
        index += 1;
        break;
      case "--avoid":
        if (!next) {
          return null;
        }
        parsed.avoidSteps.push(next);
        index += 1;
        break;
      default:
        return null;
    }
  }

  return parsed;
};

const printUsage = (): void => {
  console.log(
    'Usage: ee remember --trigger "<when this applies>" --hint "<what to do>" [--task general] [--type strategy|warning] [--goal "..."] [--applicability "..."] [--success "..."] [--step "..."] [--avoid "..."] [--cwd "..."]'
  );
};

export const runRememberCommand = (rawArgs: string[]): void => {
  const parsed = parseRememberArgs(rawArgs);
  if (!parsed?.triggerPattern || !parsed.hint) {
    printUsage();
    return;
  }

  const service = new ExperienceInteractionService(loadConfig());
  const result = service.rememberExperience({
    ...parsed,
    triggerPattern: parsed.triggerPattern,
    hint: parsed.hint
  });

  if (result.status === "invalid") {
    console.log("[ExperienceEngine] Unable to remember this experience.");
    for (const error of result.errors) {
      console.log(`- ${error}`);
    }
    return;
  }

  console.log(`[ExperienceEngine] Stored manual ${result.node.type} node ${result.node.id}.`);
  console.log(`Task type: ${result.node.taskType}`);
  console.log(`State: ${result.node.state}`);
  console.log(`Hint: ${result.node.hint}`);
};
