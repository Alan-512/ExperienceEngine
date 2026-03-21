import { createOpenAiCompatibleProfile } from "./openai-compatible-factory.js";

export const volcengineArkDistillerProvider = createOpenAiCompatibleProfile({
  provider: "volcengine_ark",
  apiKeyEnv: "VOLCENGINE_ARK_API_KEY",
  defaultBaseUrl: "https://ark.cn-beijing.volces.com/api/v3/chat/completions"
});
