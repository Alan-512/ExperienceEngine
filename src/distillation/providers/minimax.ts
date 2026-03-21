import { createOpenAiCompatibleProfile } from "./openai-compatible-factory.js";

export const miniMaxDistillerProvider = createOpenAiCompatibleProfile({
  provider: "minimax",
  apiKeyEnv: "MINIMAX_API_KEY",
  defaultBaseUrl: "https://api.minimax.chat/v1/chat/completions"
});
