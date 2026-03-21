import { createOpenAiCompatibleProfile } from "./openai-compatible-factory.js";

export const dashscopeDistillerProvider = createOpenAiCompatibleProfile({
  provider: "dashscope",
  apiKeyEnv: "DASHSCOPE_API_KEY",
  defaultBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"
});
