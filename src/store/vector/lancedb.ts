import { cosineSimilarity } from "./embeddings.js";

export type VectorRecord = {
  id: string;
  embedding: number[];
};

export type VectorMatch = {
  id: string;
  score: number;
};

export type LanceDbHandle = {
  provider: "local-hashed-cosine";
  query(records: VectorRecord[], queryEmbedding: number[], limit?: number): VectorMatch[];
};

export const openVectorStore = (): LanceDbHandle => ({
  provider: "local-hashed-cosine",
  query(records, queryEmbedding, limit = 8) {
    return [...records]
      .map((record) => ({
        id: record.id,
        score: cosineSimilarity(queryEmbedding, record.embedding)
      }))
      .filter((match) => match.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, limit);
  }
});
