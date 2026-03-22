export type SemanticEmbeddingProvider = {
  provider: "local" | "jina" | "openai" | "gemini";
  model: string;
  version: string;
  dimensions: number;
  embedQuery(text: string): Promise<number[]>;
  embedPassage(text: string): Promise<number[]>;
};
