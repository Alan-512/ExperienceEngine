export type SemanticEmbeddingProvider = {
  provider: "local" | "jina" | "openai" | "gemini";
  model: string;
  version: string;
  dimensions: number;
  manifestId?: string;
  embedQuery(text: string): Promise<number[]>;
  embedPassage(text: string): Promise<number[]>;
};
