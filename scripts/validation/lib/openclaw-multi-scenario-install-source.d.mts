export type OpenClawMultiScenarioInstallSourceOptions = {
  publishedChannel: "npm" | "clawhub";
  packageName: string;
  packageVersion: string;
  artifactPath: string;
};

export declare const resolveOpenClawMultiScenarioInstallSource: (
  options: OpenClawMultiScenarioInstallSourceOptions
) => string;
