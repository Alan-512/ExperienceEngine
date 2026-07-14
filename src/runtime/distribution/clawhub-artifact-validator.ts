import { join, resolve } from "node:path";
import {
  materializeExactClawHubArtifact,
  type ClawHubArtifactDownloader,
  type MaterializedPublishedArtifact,
  type PublishedArtifactInstaller
} from "./artifact-materializer.js";
import {
  createPublicClawHubArtifactDownloader
} from "./clawhub-artifact-downloader.js";
import {
  createNpmPublishedArtifactInstaller
} from "./npm-artifact-installer.js";
import {
  validateExactPublishedArtifactClosure,
  type PublishedArtifactClosureValidationAttempt
} from "./npm-artifact-validator.js";
import type {
  InstalledArtifactRuntimeEvidence,
  PublishedLiveActivationEvidence
} from "./types.js";

export const validateExactPublishedClawHubArtifactClosure = async (options: {
  packageName: string;
  packageVersion: string;
  validationRoot: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  downloader?: ClawHubArtifactDownloader;
  installer?: PublishedArtifactInstaller;
  materializeArtifact?: () => Promise<MaterializedPublishedArtifact>;
  installedArtifactSmokeRunner?: (input: {
    artifact: MaterializedPublishedArtifact;
    packageRoot: string;
  }) => Promise<InstalledArtifactRuntimeEvidence>;
  liveHostRunner?: (input: {
    artifact: MaterializedPublishedArtifact;
    packageRoot: string;
  }) => Promise<PublishedLiveActivationEvidence>;
  qualityPublicationGatePassed?: boolean;
  now?: () => Date;
}): Promise<PublishedArtifactClosureValidationAttempt> => {
  const validationRoot = resolve(options.validationRoot);
  const downloader = options.downloader ?? createPublicClawHubArtifactDownloader({
    baseUrl: options.baseUrl,
    fetchImpl: options.fetchImpl
  });
  return validateExactPublishedArtifactClosure({
    packageName: options.packageName,
    packageVersion: options.packageVersion,
    validationRoot,
    publishedChannel: "clawhub",
    validationSchemaVersion: "published-clawhub-closure-attempt-v1",
    materializeArtifact: options.materializeArtifact ?? (() =>
      materializeExactClawHubArtifact({
        packageName: options.packageName,
        packageVersion: options.packageVersion,
        destinationDirectory: join(validationRoot, "download"),
        downloader,
        now: options.now
      })),
    installer: options.installer ?? createNpmPublishedArtifactInstaller({
      acceptedChannels: ["clawhub"]
    }),
    installedArtifactSmokeRunner: options.installedArtifactSmokeRunner,
    liveHostRunner: options.liveHostRunner,
    qualityPublicationGatePassed: options.qualityPublicationGatePassed,
    now: options.now
  });
};

export const PUBLISHED_CLAWHUB_CLOSURE_ATTEMPT_CONTRACT = Object.freeze({
  independent_channel_materialization: true,
  public_clawhub_artifact_resolver_required: true,
  clawhub_registry_identity_required: true,
  npm_registry_evidence_interchangeable: false,
  isolated_npm_pack_install: true,
  shared_validation_sequence_only_after_channel_binding: true
});
