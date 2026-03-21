import { createOpenAiCompatibleProfile } from "./openai-compatible-factory.js";

export const baiduQianfanDistillerProvider = createOpenAiCompatibleProfile({
  provider: "baidu_qianfan",
  apiKeyEnv: "BAIDU_QIANFAN_API_KEY",
  defaultBaseUrl: "https://qianfan.baidubce.com/v2/chat/completions"
});
