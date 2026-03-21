import { createOpenAiCompatibleProfile } from "./openai-compatible-factory.js";

export const tencentHunyuanDistillerProvider = createOpenAiCompatibleProfile({
  provider: "tencent_hunyuan",
  apiKeyEnv: "TENCENT_HUNYUAN_API_KEY",
  defaultBaseUrl: "https://api.hunyuan.cloud.tencent.com/v1/chat/completions"
});
