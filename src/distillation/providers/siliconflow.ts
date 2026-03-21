import { createOpenAiCompatibleProfile } from "./openai-compatible-factory.js";

export const siliconFlowDistillerProvider = createOpenAiCompatibleProfile({
  provider: "siliconflow",
  apiKeyEnv: "SILICONFLOW_API_KEY",
  defaultBaseUrl: "https://api.siliconflow.cn/v1/chat/completions"
});
