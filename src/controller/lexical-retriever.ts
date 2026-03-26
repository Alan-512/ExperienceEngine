import type { ExperienceNode } from "../types/domain.js";
import { tokenize } from "../utils/text.js";

export type LexicalFieldScores = {
  triggerPattern: number;
  compactHint: number;
  goal: number;
  recommendedSteps: number;
  successSignal: number;
  retrievalText: number;
};

export type LexicalRetrievalScore = {
  score: number;
  fieldScores: LexicalFieldScores;
};

type WeightedField = keyof LexicalFieldScores;

const FIELD_WEIGHTS: Record<WeightedField, number> = {
  triggerPattern: 0.3,
  compactHint: 0.2,
  goal: 0.14,
  recommendedSteps: 0.22,
  successSignal: 0.08,
  retrievalText: 0.06
};

type LexicalDocument = {
  node: ExperienceNode;
  fields: Record<WeightedField, { length: number; frequencies: Map<string, number> }>;
};

const buildFieldFrequencies = (text: string | undefined): { length: number; frequencies: Map<string, number> } => {
  const tokens = tokenize(text ?? "");
  const frequencies = new Map<string, number>();
  for (const token of tokens) {
    frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
  }

  return {
    length: tokens.length,
    frequencies
  };
};

const buildLexicalDocument = (node: ExperienceNode): LexicalDocument => ({
  node,
  fields: {
    triggerPattern: buildFieldFrequencies(node.trigger_pattern),
    compactHint: buildFieldFrequencies(node.compact_hint),
    goal: buildFieldFrequencies(node.goal),
    recommendedSteps: buildFieldFrequencies(node.recommended_steps?.join("\n")),
    successSignal: buildFieldFrequencies(node.success_signal),
    retrievalText: buildFieldFrequencies(node.retrieval_text ?? `${node.trigger_pattern}\n${node.compact_hint}`)
  }
});

const computeFieldBm25 = (
  queryTokens: string[],
  field: Array<{ length: number; frequencies: Map<string, number> }>
): number[] => {
  if (!queryTokens.length || !field.length) {
    return field.map(() => 0);
  }

  const averageLength =
    field.reduce((sum, document) => sum + Math.max(1, document.length), 0) / Math.max(1, field.length);
  const documentFrequency = new Map<string, number>();

  for (const token of queryTokens) {
    let count = 0;
    for (const document of field) {
      if (document.frequencies.has(token)) {
        count += 1;
      }
    }
    documentFrequency.set(token, count);
  }

  const k1 = 1.4;
  const b = 0.75;
  const rawScores: number[] = [];
  let maxScore = 0;

  for (const document of field) {
    let score = 0;
    for (const token of queryTokens) {
      const termFrequency = document.frequencies.get(token) ?? 0;
      if (!termFrequency) {
        continue;
      }

      const df = documentFrequency.get(token) ?? 0;
      const idf = Math.log(1 + (field.length - df + 0.5) / (df + 0.5));
      const denominator = termFrequency + k1 * (1 - b + b * (document.length / averageLength));
      score += idf * ((termFrequency * (k1 + 1)) / denominator);
    }

    rawScores.push(score);
    maxScore = Math.max(maxScore, score);
  }

  if (maxScore <= 0) {
    return rawScores.map(() => 0);
  }

  return rawScores.map((score) => Number((score / maxScore).toFixed(6)));
};

export const computeLexicalRetrievalScores = (
  queryText: string,
  nodes: ExperienceNode[]
): Map<string, LexicalRetrievalScore> => {
  const queryTokens = [...new Set(tokenize(queryText))];
  if (!queryTokens.length || !nodes.length) {
    return new Map();
  }

  const documents = nodes.map(buildLexicalDocument);
  const fieldOrder: WeightedField[] = [
    "triggerPattern",
    "compactHint",
    "goal",
    "recommendedSteps",
    "successSignal",
    "retrievalText"
  ];

  const fieldScoresByName = new Map<WeightedField, number[]>();
  for (const fieldName of fieldOrder) {
    fieldScoresByName.set(
      fieldName,
      computeFieldBm25(queryTokens, documents.map((document) => document.fields[fieldName]))
    );
  }

  const scores = new Map<string, LexicalRetrievalScore>();
  let maxWeightedScore = 0;
  const weightedScores = documents.map((document, index) => {
    const fieldScores = {
      triggerPattern: fieldScoresByName.get("triggerPattern")?.[index] ?? 0,
      compactHint: fieldScoresByName.get("compactHint")?.[index] ?? 0,
      goal: fieldScoresByName.get("goal")?.[index] ?? 0,
      recommendedSteps: fieldScoresByName.get("recommendedSteps")?.[index] ?? 0,
      successSignal: fieldScoresByName.get("successSignal")?.[index] ?? 0,
      retrievalText: fieldScoresByName.get("retrievalText")?.[index] ?? 0
    };

    const weighted =
      fieldScores.triggerPattern * FIELD_WEIGHTS.triggerPattern +
      fieldScores.compactHint * FIELD_WEIGHTS.compactHint +
      fieldScores.goal * FIELD_WEIGHTS.goal +
      fieldScores.recommendedSteps * FIELD_WEIGHTS.recommendedSteps +
      fieldScores.successSignal * FIELD_WEIGHTS.successSignal +
      fieldScores.retrievalText * FIELD_WEIGHTS.retrievalText;

    maxWeightedScore = Math.max(maxWeightedScore, weighted);
    return { id: document.node.id, fieldScores, weighted };
  });

  for (const entry of weightedScores) {
    scores.set(entry.id, {
      score: maxWeightedScore > 0 ? Number((entry.weighted / maxWeightedScore).toFixed(6)) : 0,
      fieldScores: entry.fieldScores
    });
  }

  return scores;
};
