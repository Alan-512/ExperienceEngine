import { initializeRuntimeHomeIdentity } from "../../src/runtime/identity/control-plane-bootstrap.js";

const canonicalHome = process.argv[2];
if (!canonicalHome) {
  throw new Error("Expected canonical home path argument.");
}

const result = await initializeRuntimeHomeIdentity({
  writer: "package_local_initializer",
  explicitOpenClawHome: canonicalHome,
  env: {},
  defaultHome: canonicalHome
});

process.stdout.write(`${JSON.stringify({
  status: result.status,
  homeId: result.homeIdentity.home_id,
  integrityKeyId: result.integrityKey.integrity_key_id,
  fingerprint: result.homeIdentity.normalized_path_fingerprint
})}\n`);
