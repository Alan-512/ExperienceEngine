import { createOpenAiCompatibleProfile } from "./openai-compatible-factory.js";

export const zhipuDistillerProvider = createOpenAiCompatibleProfile({
  provider: "zhipu",
  apiKeyEnv: "ZHIPU_API_KEY",
  defaultBaseUrl: "https://open.bigmodel.cn/api/paas/v4/chat/completions"
});
