import { createOpenAiCompatibleProfile } from "./openai-compatible-factory.js";

export const moonshotDistillerProvider = createOpenAiCompatibleProfile({
  provider: "moonshot",
  apiKeyEnv: "MOONSHOT_API_KEY",
  defaultBaseUrl: "https://api.moonshot.cn/v1/chat/completions"
});
