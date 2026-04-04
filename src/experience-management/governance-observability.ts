import type { InjectionEvent, InjectionScorecard } from "../types/domain.js";

const parseNumericPolicyReason = (reasons: string[] | undefined, key: string): number => {
  const entry = reasons?.find((reason) => reason.startsWith(`${key}:`));
  if (!entry) {
    return 0;
  }

  const value = Number(entry.slice(key.length + 1));
  return Number.isFinite(value) ? value : 0;
};

export const getTopCandidatePolicyReasons = (scorecard?: InjectionScorecard): string[] =>
  scorecard?.topCandidates?.[0]?.policyReasons ?? [];

export const parseInjectionScorecard = (scorecardJson?: string | null): InjectionScorecard | undefined => {
  if (!scorecardJson) {
    return undefined;
  }

  try {
    return JSON.parse(scorecardJson) as InjectionScorecard;
  } catch {
    return undefined;
  }
};

export const deriveGovernanceSignals = (scorecard?: InjectionScorecard) => {
  const reasons = getTopCandidatePolicyReasons(scorecard);
  const realDevAlignment = parseNumericPolicyReason(reasons, "real_dev_alignment");
  const metaOriginPenalty = parseNumericPolicyReason(reasons, "meta_origin_penalty");
  const metaTaskAlignment = parseNumericPolicyReason(reasons, "meta_task_alignment");

  return {
    reasons,
    realDevAlignment,
    metaOriginPenalty,
    metaTaskAlignment,
    realDevAligned: realDevAlignment > 0,
    metaDominant: metaOriginPenalty > 0,
    metaTaskAligned: metaTaskAlignment > 0
  };
};

export const isPotentialMisfire = (event?: Pick<InjectionEvent, "harm_observed" | "attribution_reason">): boolean =>
  Boolean(event?.harm_observed) || event?.attribution_reason === "relevant_failure";
