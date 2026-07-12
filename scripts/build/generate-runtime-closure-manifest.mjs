import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeRuntimePackageIdentityAssets } from "../../dist/runtime/package/closure-manifest.js";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..", "..");
const manifest = writeRuntimePackageIdentityAssets(repoRoot);

process.stdout.write(
  `Generated runtime closure ${manifest.closure_manifest_digest} (${manifest.package_build_id})\n`
);
