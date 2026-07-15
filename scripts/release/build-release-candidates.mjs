import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveExperienceEnginePaths } from "../../dist/config/path-resolver.js";
import { createOpenClawInstallTarball } from "../../dist/install/openclaw-installer.js";
import { runNpmCli } from "../../dist/install/npm-cli.js";
import { assertRuntimeClosureManifest } from "../../dist/runtime/package/closure-manifest.js";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const packageJson = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
const version = packageJson.version;
const tempRoot = join(repoRoot, ".tmp");
const outputRoot = join(tempRoot, `release-candidate-v${version}`);
const relativeOutput = outputRoot.slice(tempRoot.length + 1);
if (!relativeOutput || relativeOutput.startsWith("..") || resolve(dirname(outputRoot)) !== resolve(tempRoot)) {
  throw new Error(`EE_RELEASE_OUTPUT_UNSAFE: ${outputRoot}`);
}

const trackedStatus = execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], {
  cwd: repoRoot,
  encoding: "utf8"
}).trim();
if (trackedStatus) {
  throw new Error("EE_RELEASE_SOURCE_DIRTY: commit tracked changes before generating exact candidates");
}

const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: repoRoot,
  encoding: "utf8"
}).trim();
const closure = assertRuntimeClosureManifest(repoRoot);
const closureManifest = JSON.parse(readFileSync(closure.manifestPath, "utf8"));
if (closureManifest.package_version !== version) {
  throw new Error(
    `EE_RELEASE_CLOSURE_VERSION_MISMATCH: package=${version} closure=${closureManifest.package_version}`
  );
}

rmSync(outputRoot, { recursive: true, force: true });
mkdirSync(outputRoot, { recursive: true });

const npmPackOutput = runNpmCli([
  "pack",
  ".",
  "--json",
  "--ignore-scripts",
  "--pack-destination",
  outputRoot
], repoRoot);
const npmPackResults = JSON.parse(npmPackOutput);
const npmFilename = npmPackResults[0]?.filename;
if (!npmFilename) {
  throw new Error("EE_RELEASE_NPM_PACK_FAILED: npm pack returned no filename");
}
const npmArtifactPath = join(outputRoot, npmFilename);

const builderHome = join(outputRoot, ".builder-state");
const paths = resolveExperienceEnginePaths({
  adapter: "openclaw",
  env: {
    ...process.env,
    EXPERIENCE_ENGINE_HOME: builderHome
  }
});
mkdirSync(join(paths.productHome, "adapters", "openclaw"), { recursive: true });
const generatedClawHubPath = createOpenClawInstallTarball(repoRoot, paths);
const clawHubFilename = `alan512-experienceengine-clawhub-${version}.tgz`;
const clawHubArtifactPath = join(outputRoot, clawHubFilename);
copyFileSync(generatedClawHubPath, clawHubArtifactPath);
rmSync(builderHome, { recursive: true, force: true });

const hashFile = (path, algorithm, encoding = "hex") =>
  createHash(algorithm).update(readFileSync(path)).digest(encoding);
const inspectArtifact = (channel, path) => {
  const entries = execFileSync("tar", ["-tzf", path], { encoding: "utf8" })
    .split(/\r?\n/)
    .filter(Boolean);
  return {
    channel,
    filename: basename(path),
    size: statSync(path).size,
    file_count: entries.length,
    sha256: hashFile(path, "sha256"),
    sha1: hashFile(path, "sha1"),
    integrity: `sha512-${hashFile(path, "sha512", "base64")}`,
    contains_bundled_sdk: entries.includes("package/node_modules/@modelcontextprotocol/sdk/package.json"),
    contains_bundled_zod: entries.includes("package/node_modules/zod/package.json")
  };
};

const candidateManifest = {
  schema_version: "experienceengine-release-candidates-v1",
  package_name: packageJson.name,
  package_version: version,
  source_commit: sourceCommit,
  generated_at: new Date().toISOString(),
  closure_manifest_digest: closure.closureManifestDigest,
  package_build_id: closure.packageBuildId,
  artifacts: [
    inspectArtifact("npm", npmArtifactPath),
    inspectArtifact("clawhub", clawHubArtifactPath)
  ],
  publication: {
    npm: false,
    clawhub: false,
    git_tag: false,
    github_release: false
  },
  support: {
    production_learning_ready: false,
    support_claim_allowed: false
  }
};

writeFileSync(
  join(outputRoot, "candidate-manifest.json"),
  `${JSON.stringify(candidateManifest, null, 2)}\n`,
  "utf8"
);
process.stdout.write(`${JSON.stringify(candidateManifest, null, 2)}\n`);
