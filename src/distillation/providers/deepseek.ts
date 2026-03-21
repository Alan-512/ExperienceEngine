import { createOpenAiCompatibleProfile } from "./openai-compatible-factory.js";

export const deepSeekDistillerProvider = createOpenAiCompatibleProfile({
  provider: "deepseek",
  apiKeyEnv: "DEEPSEEK_API_KEY",
  defaultBaseUrl: "https://api.deepseek.com/v1/chat/completions"
});
