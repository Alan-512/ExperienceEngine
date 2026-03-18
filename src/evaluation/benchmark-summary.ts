export type EffectivenessCounts = {
  decisions: number;
  live: number;
  shadow: number;
  holdout: number;
  delivered: number;
  suppressed: number;
  automaticHelped: number;
  automaticHarmed: number;
};

export type BenchmarkVerdict = "warming_up" | "healthy" | "watch" | "failing";

export type BenchmarkSummary = {
  deliveryRate: number;
  suppressionRate: number;
  helpfulRate: number;
  harmfulRate: number;
  netHelpfulRate: number;
  verdict: BenchmarkVerdict;
  suggestedMode: "live" | "shadow" | "holdout";
  recommendation: string;
};

export type ModeBenchmarkSummary = BenchmarkSummary & {
  decisions: number;
  delivered: number;
  suppressed: number;
  automaticHelped: number;
  automaticHarmed: number;
};

const ratio = (value: number, total: number): number =>
  total > 0 ? Number((value / total).toFixed(4)) : 0;

export const buildBenchmarkSummary = (effectiveness: EffectivenessCounts): BenchmarkSummary => {
  const deliveryRate = ratio(effectiveness.delivered, effectiveness.decisions);
  const suppressionRate = ratio(effectiveness.suppressed, effectiveness.decisions);
  const helpfulRate = ratio(effectiveness.automaticHelped, effectiveness.decisions);
  const harmfulRate = ratio(effectiveness.automaticHarmed, effectiveness.decisions);
  const netHelpfulRate =
    effectiveness.decisions > 0
      ? Number(((effectiveness.automaticHelped - effectiveness.automaticHarmed) / effectiveness.decisions).toFixed(4))
      : 0;

  let verdict: BenchmarkVerdict = "watch";
  let suggestedMode: BenchmarkSummary["suggestedMode"] = "shadow";
  let recommendation = "Keep collecting live decisions and inspect recent injections with `ee inspect --last`.";

  if (effectiveness.decisions < 3) {
    verdict = "warming_up";
    suggestedMode = "shadow";
    recommendation = "Collect at least 3 decisions before treating benchmark numbers as stable.";
  } else if (netHelpfulRate >= 0.25 && harmfulRate <= 0.1) {
    verdict = "healthy";
    suggestedMode = "live";
    recommendation = "Current intervention quality looks healthy. Keep live mode on and continue collecting feedback.";
  } else if (netHelpfulRate < 0 || harmfulRate > 0.2) {
    verdict = "failing";
    suggestedMode = "holdout";
    recommendation = "Too many interventions are harmful. Switch to shadow or holdout and inspect the highest-risk nodes.";
  } else {
    verdict = "watch";
    suggestedMode = "shadow";
    recommendation = "Results are mixed. Keep observing scorecards and review recently injected nodes before widening rollout.";
  }

  return {
    deliveryRate,
    suppressionRate,
    helpfulRate,
    harmfulRate,
    netHelpfulRate,
    verdict,
    suggestedMode,
    recommendation
  };
};

export const buildModeBenchmarkSummary = (effectiveness: EffectivenessCounts): ModeBenchmarkSummary => ({
  ...buildBenchmarkSummary(effectiveness),
  decisions: effectiveness.decisions,
  delivered: effectiveness.delivered,
  suppressed: effectiveness.suppressed,
  automaticHelped: effectiveness.automaticHelped,
  automaticHarmed: effectiveness.automaticHarmed
});
