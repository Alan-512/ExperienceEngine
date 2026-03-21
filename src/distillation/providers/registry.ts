import { openAiDistillerProvider } from "./openai.js";
import { anthropicDistillerProvider } from "./anthropic.js";
import { geminiDistillerProvider } from "./gemini.js";
import { azureOpenAiDistillerProvider } from "./azure-openai.js";
import { bedrockDistillerProvider } from "./bedrock.js";
import { openAiCompatibleDistillerProvider } from "./openai-compatible.js";
import { openRouterDistillerProvider } from "./openrouter.js";
import { deepSeekDistillerProvider } from "./deepseek.js";
import { moonshotDistillerProvider } from "./moonshot.js";
import { dashscopeDistillerProvider } from "./dashscope.js";
import { zhipuDistillerProvider } from "./zhipu.js";
import { siliconFlowDistillerProvider } from "./siliconflow.js";
import { miniMaxDistillerProvider } from "./minimax.js";
import { volcengineArkDistillerProvider } from "./volcengine-ark.js";
import { tencentHunyuanDistillerProvider } from "./tencent-hunyuan.js";
import { baiduQianfanDistillerProvider } from "./baidu-qianfan.js";
import type { DistillerProvider, DistillerProviderAdapter } from "./types.js";

const REGISTERED_PROVIDERS: DistillerProviderAdapter[] = [
  openAiDistillerProvider,
  anthropicDistillerProvider,
  geminiDistillerProvider,
  azureOpenAiDistillerProvider,
  bedrockDistillerProvider,
  openAiCompatibleDistillerProvider,
  openRouterDistillerProvider,
  deepSeekDistillerProvider,
  moonshotDistillerProvider,
  dashscopeDistillerProvider,
  zhipuDistillerProvider,
  siliconFlowDistillerProvider,
  miniMaxDistillerProvider,
  volcengineArkDistillerProvider,
  tencentHunyuanDistillerProvider,
  baiduQianfanDistillerProvider
];

export const listDistillerProviderAdapters = (): DistillerProviderAdapter[] => [
  ...REGISTERED_PROVIDERS
];

export const getDistillerProviderAdapter = (
  provider: DistillerProvider
): DistillerProviderAdapter => {
  const adapter = REGISTERED_PROVIDERS.find((entry) => entry.provider === provider);
  if (!adapter) {
    throw new Error(`Unsupported distiller provider: ${provider}`);
  }

  return adapter;
};
