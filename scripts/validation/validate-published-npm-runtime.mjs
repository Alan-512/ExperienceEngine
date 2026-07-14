import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateExactPublishedNpmArtifactClosure
} from "../../dist/runtime/distribution/npm-artifact-validator.js";
import {
  runInstalledArtifactRuntimeSmoke
} from "../../dist/runtime/distribution/installed-artifact-runtime-smoke.js";
import {
  runOpenClawHostValidation
} from "../../dist/runtime/distribution/openclaw-host-validation-runner.js";
import {
  createSqliteOpenClawHostAuthorityCollector
} from "../../dist/runtime/distribution/sqlite-openclaw-host-authority-collector.js";
import {
  createPublishedOpenClawHostFixture
} from "../../dist/runtime/distribution/published-openclaw-host-fixture.js";

const sourceRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const packageJson = JSON.parse(
  await readFile(join(sourceRoot, "package.json"), "utf8")
);
const packageName = process.env.EXPERIENCE_ENGINE_PUBLISHED_NPM_PACKAGE?.trim() ||
  packageJson.name;
const packageVersion = process.env.EXPERIENCE_ENGINE_PUBLISHED_NPM_VERSION?.trim() ||
  packageJson.version;
const validationRoot = await mkdtemp(
  join(tmpdir(), "ee-published-npm-validation-")
);
const harnessSourcePath = join(
  sourceRoot,
  "scripts",
  "validation",
  "validate-openclaw-production-binding.mjs"
);
const openclawExecutable =
  process.env.EXPERIENCE_ENGINE_OPENCLAW_EXECUTABLE?.trim() || null;
const requireLiveHost =
  process.env.EXPERIENCE_ENGINE_REQUIRE_LIVE_HOST === "true";

if (requireLiveHost && !openclawExecutable) {
  throw new Error(
    "EXPERIENCE_ENGINE_OPENCLAW_EXECUTABLE is required for the real live-host gate."
  );
}

try {
  const result = await validateExactPublishedNpmArtifactClosure({
    packageName,
    packageVersion,
    validationRoot,
    installedArtifactSmokeRunner: ({ artifact, packageRoot }) =>
      runInstalledArtifactRuntimeSmoke({
        artifact,
        packageRoot,
        harnessSourcePath
      }),
    liveHostRunner: openclawExecutable
      ? async ({ artifact, packageRoot }) => {
          const fixture = await createPublishedOpenClawHostFixture();
          const runtimeHome = join(validationRoot, "real-host-runtime-home");
          const sqlitePath = join(
            runtimeHome,
            "sqlite",
            "experienceengine.db"
          );
          const collector = createSqliteOpenClawHostAuthorityCollector({
            startFixture: fixture.startFixture
          });
          return runOpenClawHostValidation({
            artifact,
            openclawExecutable,
            validationRoot: join(validationRoot, "real-host"),
            runtimeHome,
            sqlitePath,
            pluginConfig: {
              dataDir: runtimeHome,
              sqlitePath,
              captureDir: join(runtimeHome, "captures")
            },
            authorityCollector: collector,
            seedConfigPath:
              process.env.EXPERIENCE_ENGINE_OPENCLAW_SEED_CONFIG?.trim() ||
              undefined,
            agentId:
              process.env.EXPERIENCE_ENGINE_OPENCLAW_AGENT_ID?.trim() ||
              undefined,
            approveHostSecurityScan:
              process.env.EXPERIENCE_ENGINE_APPROVE_HOST_SECURITY_SCAN ===
              "true",
            prepareRuntimeAuthority: fixture.prepareRuntimeAuthority,
            cleanupRuntimeFixture: fixture.cleanup
          });
        }
      : undefined,
    qualityPublicationGatePassed: false
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = [
    "closure_passed_live_pending",
    "installed_artifact_validated_live_host_pending",
    "artifact_runtime_validated"
  ].includes(result.status) ? 0 : 1;
} finally {
  await rm(validationRoot, {
    recursive: true,
    force: true,
    maxRetries: 20,
    retryDelay: 100
  });
}
