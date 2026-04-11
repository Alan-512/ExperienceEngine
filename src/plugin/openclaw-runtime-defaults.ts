export type OpenClawRuntimeDefaults = {
  learningLoopState: "learning_loop_active" | "interaction_only";
  backgroundLearningEnabled: boolean;
  hybridPosttaskEnabled: boolean;
};

export const OPENCLAW_BACKGROUND_LEARNING_ENABLED = true;
export const OPENCLAW_HYBRID_POSTTASK_ENABLED = false;

export const getOpenClawRuntimeDefaults = (): OpenClawRuntimeDefaults => ({
  learningLoopState: OPENCLAW_BACKGROUND_LEARNING_ENABLED ? "learning_loop_active" : "interaction_only",
  backgroundLearningEnabled: OPENCLAW_BACKGROUND_LEARNING_ENABLED,
  hybridPosttaskEnabled: OPENCLAW_HYBRID_POSTTASK_ENABLED
});
