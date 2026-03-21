export const DISTILLER_PROVIDERS = [
  "openai",
  "anthropic",
  "gemini",
  "openrouter",
  "azure_openai",
  "bedrock",
  "openai_compatible",
  "dashscope",
  "deepseek",
  "moonshot",
  "zhipu",
  "siliconflow",
  "minimax",
  "volcengine_ark",
  "tencent_hunyuan",
  "baidu_qianfan"
] as const;

export type DistillerProvider = (typeof DISTILLER_PROVIDERS)[number];

export type OpenAiStyleEndpoint = {
  kind: "openai";
  model: string;
  baseUrl: string;
  headers: Record<string, string>;
  source: "explicit";
  provider: DistillerProvider;
};

export type AnthropicEndpoint = {
  kind: "anthropic";
  model: string;
  baseUrl: string;
  headers: Record<string, string>;
  source: "explicit";
  provider: DistillerProvider;
};

export type GeminiEndpoint = {
  kind: "gemini";
  model: string;
  baseUrl: string;
  headers: Record<string, string>;
  source: "explicit";
  provider: DistillerProvider;
};

export type BedrockEndpoint = {
  kind: "bedrock";
  model: string;
  baseUrl: string;
  headers: Record<string, string>;
  source: "explicit";
  provider: DistillerProvider;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
};

export type DistillerEndpoint = OpenAiStyleEndpoint | AnthropicEndpoint | GeminiEndpoint | BedrockEndpoint;

export type DistillationDiagnostics = {
  configured: boolean;
  provider: DistillerProvider;
  model?: string;
  baseUrl: string;
  missingEnv: string[];
};

export type ProviderResolution = {
  provider: DistillerProvider;
  diagnostics: DistillationDiagnostics;
  endpoint: DistillerEndpoint | null;
};

export type DistillerProviderAdapter = {
  provider: DistillerProvider;
  resolve(env: NodeJS.ProcessEnv): ProviderResolution;
};
