import { loadConfig } from "../../config/load-config.js";
import { inspectOpenClawInstall } from "../../install/openclaw-installer.js";
import {
  inspectCliRuntimeAuthority,
  type CliRuntimeAuthorityInspection
} from "../../runtime/activation/cli-inspection.js";
import {
  readOpenClawRuntimeHealthEvidence,
  type OpenClawRuntimeHealthEvidence
} from "../../plugin/openclaw-runtime-health.js";

export type OpenClawProductionVerification = {
  verification_schema_version: "openclaw-production-verification-v1";
  ok: boolean;
  code: string;
  interaction_active: boolean;
  learning_runtime_active: boolean;
  production_learning_ready: boolean;
  process_activation_current: boolean;
  package_activation_state: string;
  runtime_health_code: string | null;
  next_action: string;
};

const readBoolean = (
  projection: Record<string, unknown> | null,
  field: string
): boolean => projection?.[field] === true;

export const evaluateOpenClawProductionVerification = (options: {
  installed: boolean;
  interactionActive: boolean;
  authority: CliRuntimeAuthorityInspection;
  health: OpenClawRuntimeHealthEvidence | null;
}): OpenClawProductionVerification => {
  const projection = options.health?.status_projection ?? null;
  const interactionActive = readBoolean(projection, "interaction_active") ||
    options.interactionActive;
  const learningRuntimeActive = readBoolean(
    projection,
    "learning_runtime_active"
  );
  const productionLearningReady = readBoolean(
    projection,
    "production_learning_ready"
  );
  const ok = options.installed &&
    interactionActive &&
    options.health?.lifecycle_state === "active" &&
    options.authority.process_activation_current &&
    learningRuntimeActive;
  const code = ok
    ? "EE_OPENCLAW_PRODUCTION_RUNTIME_VERIFIED"
    : options.health?.lifecycle_state === "failed"
      ? options.health.code
      : !options.installed
        ? "EE_OPENCLAW_NOT_INSTALLED"
        : !interactionActive
          ? "EE_OPENCLAW_INTERACTION_INACTIVE"
          : !options.authority.process_activation_current
            ? "EE_OPENCLAW_PRODUCTION_AUTHORITY_NOT_CURRENT"
            : "EE_OPENCLAW_PRODUCTION_RUNTIME_INACTIVE";
  return {
    verification_schema_version: "openclaw-production-verification-v1",
    ok,
    code,
    interaction_active: interactionActive,
    learning_runtime_active: learningRuntimeActive,
    production_learning_ready: productionLearningReady,
    process_activation_current: options.authority.process_activation_current,
    package_activation_state: options.authority.package_activation_state,
    runtime_health_code: options.health?.code ?? null,
    next_action: ok
      ? productionLearningReady
        ? "The current OpenClaw production runtime and quality readiness are authoritative."
        : "Runtime authority is active; published-channel and quality support claims remain independently gated."
      : options.health?.next_action ?? options.authority.next_action
  };
};

export const runVerifyCommand = (
  target?: string,
  deps: {
    inspectOpenClawInstall?: typeof inspectOpenClawInstall;
    inspectCliRuntimeAuthority?: typeof inspectCliRuntimeAuthority;
    readOpenClawRuntimeHealthEvidence?: typeof readOpenClawRuntimeHealthEvidence;
  } = {}
): void => {
  if (target !== "openclaw-production") {
    console.log("Usage: ee verify openclaw-production");
    process.exitCode = 2;
    return;
  }
  const config = loadConfig();
  const install = (deps.inspectOpenClawInstall ?? inspectOpenClawInstall)();
  const authority = (deps.inspectCliRuntimeAuthority ?? inspectCliRuntimeAuthority)({
    sqlitePath: config.sqlitePath ?? "",
    interactionActive: Boolean(install.hostState?.enabled),
    packageInstalled: install.installed
  });
  const health = (
    deps.readOpenClawRuntimeHealthEvidence ??
      readOpenClawRuntimeHealthEvidence
  )(config.dataDir);
  const verification = evaluateOpenClawProductionVerification({
    installed: install.installed,
    interactionActive: Boolean(install.hostState?.enabled),
    authority,
    health
  });
  console.log(JSON.stringify(verification, null, 2));
  if (!verification.ok) {
    process.exitCode = 1;
  }
};
