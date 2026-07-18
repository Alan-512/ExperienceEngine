export const resolveOpenClawMultiScenarioInstallSource = (options) => {
  if (options.publishedChannel === "npm") {
    return `npm:${options.packageName}@${options.packageVersion}`;
  }
  if (options.publishedChannel === "clawhub") {
    return options.artifactPath;
  }
  throw new Error(
    `Unsupported OpenClaw multi-scenario published channel: ${options.publishedChannel}`
  );
};
