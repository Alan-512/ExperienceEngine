import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  randomUUID,
  sign
} from "node:crypto";
import { spawn, execFile } from "node:child_process";
import {
  access,
  chmod,
  copyFile,
  mkdir,
  readFile,
  rm,
  writeFile
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { backup, DatabaseSync } from "node:sqlite";
import { promisify } from "node:util";
import type {
  MaterializedPublishedArtifact
} from "./artifact-materializer.js";
import {
  PublishedRuntimeClosureError
} from "./contract.js";
import type {
  OpenClawLiveHostEnvironment,
  PublishedLiveActivationBinding,
  PublishedLiveActivationEvidence,
  PublishedProtectedQueueEvidence,
  PublishedShutdownEvidence
} from "./types.js";
import {
  LIVE_ACTIVATION_EVIDENCE_VERSION
} from "./constants.js";
import {
  parseOpenClawPluginInfo
} from "../../install/openclaw-cli.js";
import {
  resolveWindowsOpenClawExecutable,
  resolveWindowsOpenClawProcessInvocation
} from "../../install/windows-openclaw-resolver.js";
import {
  digestOpenClawSecurityScanSummary,
  isOpenClawSecurityApprovalRequired
} from "../../install/openclaw-security-approval.js";
import {
  assertRuntimeClosureManifest
} from "../package/closure-manifest.js";
import {
  createOrAdoptRuntimeInstallAttestation,
  fingerprintRuntimeInstallPath
} from "../package/install-attestation.js";
import {
  initializeRuntimeHomeIdentity
} from "../identity/control-plane-bootstrap.js";
import {
  OPENCLAW_NATIVE_COMMAND_GATEWAY_METHOD,
  createOpenClawNativeCommandGatewayRequest,
  parseOpenClawNativeCommandGatewayResponse
} from "../activation/openclaw-native-command-gateway.js";
import type {
  OpenClawNativeOperation
} from "../activation/constants.js";
import type {
  OpenClawNativeOperationResult
} from "../activation/native-service.js";

const execFileAsync = promisify(execFile);

const WINDOWS_GATEWAY_GRACEFUL_STOP_COMMAND =
  "__experienceengine_openclaw_gateway_graceful_stop__";

export const OPENCLAW_DIRECT_GATEWAY_PROTOCOL_RANGE = Object.freeze({
  minProtocol: 3,
  maxProtocol: 4
});

const WINDOWS_GATEWAY_WRAPPER_SOURCE = `
import { pathToFileURL } from "node:url";

const stopCommand = ${JSON.stringify(WINDOWS_GATEWAY_GRACEFUL_STOP_COMMAND)};
let stdinBuffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  stdinBuffer += chunk;
  for (;;) {
    const newlineIndex = stdinBuffer.indexOf("\\n");
    if (newlineIndex < 0) {
      break;
    }
    const line = stdinBuffer.slice(0, newlineIndex).trim();
    stdinBuffer = stdinBuffer.slice(newlineIndex + 1);
    if (line === stopCommand) {
      process.emit("SIGINT");
    }
  }
});

const entrypoint = process.argv[1];
if (!entrypoint) {
  throw new Error("Missing OpenClaw entrypoint for Windows Gateway wrapper.");
}
await import(pathToFileURL(entrypoint).href);
`;

export type OpenClawHostCommand = {
  executable: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  cwd?: string;
  timeoutMs: number;
};

export type OpenClawHostCommandResult = {
  stdout: string;
  stderr: string;
};

export type OpenClawHostCommandRunner = (
  command: OpenClawHostCommand
) => Promise<OpenClawHostCommandResult>;

export type OpenClawGatewayProcess = {
  pid: number | null;
  stop: () => Promise<void>;
  readOutput: () => { stdout: string; stderr: string };
  waitForExit: () => Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
    stdout: string;
    stderr: string;
  }>;
};

export type OpenClawGatewaySpawner = (options: {
  executable: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  cwd?: string;
}) => Promise<OpenClawGatewayProcess>;

export type OpenClawGatewaySpawnPlan = {
  file: string;
  args: string[];
  gracefulStopViaStdin: boolean;
};

export const buildOpenClawGatewaySpawnPlan = (options: {
  invocation: { file: string; args: string[] };
  platform?: NodeJS.Platform;
}): OpenClawGatewaySpawnPlan => {
  if ((options.platform ?? process.platform) !== "win32") {
    return {
      ...options.invocation,
      gracefulStopViaStdin: false
    };
  }
  return {
    file: options.invocation.file,
    args: [
      "--disable-warning=ExperimentalWarning",
      "--input-type=module",
      "-e",
      WINDOWS_GATEWAY_WRAPPER_SOURCE,
      ...options.invocation.args
    ],
    gracefulStopViaStdin: true
  };
};

export type OpenClawHostActiveEvidence = {
  activation: PublishedLiveActivationBinding;
  queue: PublishedProtectedQueueEvidence;
  interaction_active: true;
  learning_runtime_active: true;
  production_learning_ready: boolean;
};

export type OpenClawHostInitializationSnapshot = {
  home_id: string;
  projection_revision: number;
  launch_revision: number;
  authority_tables: Record<string, Array<Record<string, unknown>>>;
};

export type OpenClawHostAuthorityCollector = {
  captureInitializationSnapshot: (options: {
    sqlitePath: string;
    runtimeHome: string;
    timeoutMs: number;
  }) => Promise<OpenClawHostInitializationSnapshot>;
  verifyInitializationIdempotency: (options: {
    sqlitePath: string;
    runtimeHome: string;
    controlRequestId: string;
    authorizationId: string;
    expectedPackageGenerationId: string;
    timeoutMs: number;
  }) => Promise<void>;
  captureActiveEvidence: (options: {
    sqlitePath: string;
    runtimeHome: string;
    timeoutMs: number;
  }) => Promise<OpenClawHostActiveEvidence>;
  verifyRestartRecovery: (options: {
    sqlitePath: string;
    runtimeHome: string;
    prior: OpenClawHostActiveEvidence;
    timeoutMs: number;
  }) => Promise<void>;
  captureShutdownEvidence: (options: {
    sqlitePath: string;
    runtimeHome: string;
    timeoutMs: number;
  }) => Promise<PublishedShutdownEvidence>;
};

export type OpenClawInstalledPackageVerifier = (installedRoot: string) => Promise<{
  packageBuildId: string;
  closureManifestDigest: string;
}>;

type OpenClawInstalledPackageIdentity = Awaited<
  ReturnType<OpenClawInstalledPackageVerifier>
>;

export const assertOpenClawInstalledPackageMatchesExpected = (
  installedPackage: OpenClawInstalledPackageIdentity,
  expectedPackage: OpenClawInstalledPackageIdentity
): void => {
  if (
    installedPackage.packageBuildId !== expectedPackage.packageBuildId ||
    installedPackage.closureManifestDigest !==
      expectedPackage.closureManifestDigest
  ) {
    throw new PublishedRuntimeClosureError(
      "EE_PUBLISHED_ARTIFACT_INSTALL_INVALID",
      "OpenClaw installed package closure does not match the independently materialized published artifact."
    );
  }
};

export type OpenClawPublishedAttestationIssuer = (options: {
  installedRoot: string;
  stateDir: string;
  runtimeHome: string;
  sqlitePath: string;
  openclawVersion: string;
  artifact: MaterializedPublishedArtifact;
  packageBuildId: string;
  closureManifestDigest: string;
  security: {
    security_scan_status: OpenClawLiveHostEnvironment["security_scan_status"];
    security_scan_summary_digest: string | null;
  };
  now: () => Date;
}) => Promise<void>;

const resolveHostProcessInvocation = (options: {
  executable: string;
  args: string[];
  env: NodeJS.ProcessEnv;
}): { file: string; args: string[] } => {
  if (process.platform !== "win32") {
    return { file: options.executable, args: options.args };
  }
  const resolved = resolveWindowsOpenClawExecutable({
    operatorConfiguredPath: options.executable,
    env: options.env
  });
  const invocation = resolveWindowsOpenClawProcessInvocation({
    executable: resolved
  });
  return {
    file: invocation.file,
    args: [...invocation.args_prefix, ...options.args]
  };
};

const defaultCommandRunner: OpenClawHostCommandRunner = async (command) => {
  try {
    const invocation = resolveHostProcessInvocation({
      executable: command.executable,
      args: command.args,
      env: command.env
    });
    const result = await execFileAsync(invocation.file, invocation.args, {
      cwd: command.cwd,
      env: command.env,
      timeout: command.timeoutMs,
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true,
      encoding: "utf8"
    });
    return {
      stdout: result.stdout,
      stderr: result.stderr
    };
  } catch (error) {
    const failure = error as Error & {
      stdout?: string;
      stderr?: string;
      code?: unknown;
      signal?: unknown;
      killed?: unknown;
    };
    throw new PublishedRuntimeClosureError(
      "EE_OPENCLAW_LIVE_HOST_COMMAND_FAILED",
      `OpenClaw command failed (code=${String(
        failure.code ?? "unknown"
      )}, signal=${String(failure.signal ?? "none")}, killed=${String(
        failure.killed ?? false
      )}): ${
        failure.stderr?.trim() || failure.stdout?.trim() || failure.message
      }`
    );
  }
};

const defaultGatewaySpawner: OpenClawGatewaySpawner = async (options) => {
  const spawnPlan = buildOpenClawGatewaySpawnPlan({
    invocation: resolveHostProcessInvocation({
      executable: options.executable,
      args: options.args,
      env: options.env
    })
  });
  const child = spawn(spawnPlan.file, spawnPlan.args, {
    cwd: options.cwd,
    env: options.env,
    stdio: [
      spawnPlan.gracefulStopViaStdin ? "pipe" : "ignore",
      "pipe",
      "pipe"
    ],
    windowsHide: true,
    detached: process.platform === "win32"
  });
  let stderr = "";
  let stdout = "";
  child.stdout?.on("data", (chunk: Buffer | string) => {
    stdout += chunk.toString();
    if (stdout.length > 1024 * 1024) {
      stdout = stdout.slice(-1024 * 1024);
    }
  });
  child.stderr?.on("data", (chunk: Buffer | string) => {
    stderr += chunk.toString();
    if (stderr.length > 1024 * 1024) {
      stderr = stderr.slice(-1024 * 1024);
    }
  });
  const exitPromise = new Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
    stdout: string;
    stderr: string;
  }>(
    (resolveExit, rejectExit) => {
      child.once("error", rejectExit);
      child.once("exit", (code, signal) => resolveExit({
        code,
        signal,
        stdout,
        stderr
      }));
    }
  );
  return {
    pid: child.pid ?? null,
    readOutput: () => ({ stdout, stderr }),
    stop: async () => {
      if (child.exitCode !== null || child.signalCode !== null) {
        return;
      }
      if (spawnPlan.gracefulStopViaStdin) {
        if (!child.stdin?.writable) {
          throw new PublishedRuntimeClosureError(
            "EE_OPENCLAW_LIVE_HOST_SHUTDOWN_TIMEOUT",
            "OpenClaw Gateway Windows shutdown channel is unavailable."
          );
        }
        child.stdin.write(`${WINDOWS_GATEWAY_GRACEFUL_STOP_COMMAND}\n`);
        child.stdin.end();
      } else {
        child.kill("SIGTERM");
      }
      const timeout = new Promise<never>((_, rejectTimeout) => {
        const timer = setTimeout(() => {
          rejectTimeout(new PublishedRuntimeClosureError(
            "EE_OPENCLAW_LIVE_HOST_SHUTDOWN_TIMEOUT",
            `OpenClaw Gateway did not stop after the graceful shutdown request. ${stderr.trim()}`
          ));
        }, spawnPlan.gracefulStopViaStdin ? 35_000 : 20_000);
        timer.unref();
      });
      try {
        await Promise.race([exitPromise, timeout]);
      } catch (error) {
        child.kill();
        throw error;
      }
    },
    waitForExit: () => exitPromise
  };
};

const sleep = (milliseconds: number): Promise<void> =>
  new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));

const boundedOpenClawCliTimeout = (
  overallTimeoutMs: number,
  defaultTimeoutMs: number
): number => Math.min(
  overallTimeoutMs,
  process.platform === "win32"
    ? Math.max(defaultTimeoutMs, 60_000)
    : defaultTimeoutMs
);

const runCommand = async (options: {
  runner: OpenClawHostCommandRunner;
  executable: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  cwd?: string;
  timeoutMs: number;
}): Promise<OpenClawHostCommandResult> => options.runner({
  executable: options.executable,
  args: options.args,
  env: options.env,
  cwd: options.cwd,
  timeoutMs: options.timeoutMs
});

type OpenClawNativeCommandResult = OpenClawNativeOperationResult;

type DirectGatewaySocket = {
  addEventListener: (
    type: "open" | "message" | "close" | "error",
    listener: (event: unknown) => void,
    options?: { once?: boolean }
  ) => void;
  send: (data: string) => void;
  close: (code?: number, reason?: string) => void;
};

type DirectGatewaySocketConstructor = new (url: string) => DirectGatewaySocket;

export type DirectGatewayRpcClient = {
  request: (method: string, params: Record<string, unknown>) => Promise<unknown>;
  close: () => void;
};

export type DirectGatewayRpcClientFactory = (options: {
  gatewayUrl: string;
  gatewayToken: string;
  timeoutMs: number;
  stateDir: string;
  clientVersion: string;
}) => Promise<DirectGatewayRpcClient>;

type OpenClawValidationDeviceIdentity = {
  deviceId: string;
  publicKeyPem: string;
  privateKeyPem: string;
};

const ED25519_SPKI_PREFIX = Buffer.from(
  "302a300506032b6570032100",
  "hex"
);

const deriveOpenClawPublicKeyRaw = (publicKeyPem: string): Buffer => {
  const spki = createPublicKey(publicKeyPem).export({
    type: "spki",
    format: "der"
  });
  return spki.length === ED25519_SPKI_PREFIX.length + 32 &&
    spki.subarray(0, ED25519_SPKI_PREFIX.length).equals(ED25519_SPKI_PREFIX)
    ? spki.subarray(ED25519_SPKI_PREFIX.length)
    : spki;
};

const deriveOpenClawDeviceId = (publicKeyPem: string): string =>
  createHash("sha256")
    .update(deriveOpenClawPublicKeyRaw(publicKeyPem))
    .digest("hex");

const loadOrCreateValidationDeviceIdentity = async (
  stateDir: string
): Promise<OpenClawValidationDeviceIdentity> => {
  const identityPath = join(stateDir, "identity", "device.json");
  try {
    const parsed = JSON.parse(await readFile(identityPath, "utf8")) as {
      version?: unknown;
      deviceId?: unknown;
      publicKeyPem?: unknown;
      privateKeyPem?: unknown;
    };
    if (
      parsed.version === 1 &&
      typeof parsed.publicKeyPem === "string" &&
      typeof parsed.privateKeyPem === "string"
    ) {
      const deviceId = deriveOpenClawDeviceId(parsed.publicKeyPem);
      return {
        deviceId,
        publicKeyPem: parsed.publicKeyPem,
        privateKeyPem: parsed.privateKeyPem
      };
    }
  } catch {
    // The isolated validation state may not have invoked an OpenClaw CLI yet.
  }

  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({
    type: "spki",
    format: "pem"
  }).toString();
  const privateKeyPem = privateKey.export({
    type: "pkcs8",
    format: "pem"
  }).toString();
  const deviceId = deriveOpenClawDeviceId(publicKeyPem);
  await mkdir(dirname(identityPath), { recursive: true });
  await writeFile(identityPath, `${JSON.stringify({
    version: 1,
    deviceId,
    publicKeyPem,
    privateKeyPem,
    createdAtMs: Date.now()
  }, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await chmod(identityPath, 0o600).catch(() => undefined);
  return { deviceId, publicKeyPem, privateKeyPem };
};

const signOpenClawDeviceChallenge = (options: {
  identity: OpenClawValidationDeviceIdentity;
  clientId: string;
  clientMode: string;
  role: string;
  scopes: string[];
  signedAtMs: number;
  token: string;
  nonce: string;
  platform: string;
  deviceFamily?: string;
}): { publicKey: string; signature: string } => {
  const payload = [
    "v3",
    options.identity.deviceId,
    options.clientId,
    options.clientMode,
    options.role,
    options.scopes.join(","),
    String(options.signedAtMs),
    options.token,
    options.nonce,
    options.platform.trim(),
    options.deviceFamily?.trim() ?? ""
  ].join("|");
  return {
    publicKey: deriveOpenClawPublicKeyRaw(
      options.identity.publicKeyPem
    ).toString("base64url"),
    signature: sign(
      null,
      Buffer.from(payload, "utf8"),
      createPrivateKey(options.identity.privateKeyPem)
    ).toString("base64url")
  };
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const socketMessageText = async (event: unknown): Promise<string> => {
  const data = asRecord(event)?.data;
  if (typeof data === "string") {
    return data;
  }
  if (Buffer.isBuffer(data)) {
    return data.toString("utf8");
  }
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString("utf8");
  }
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(
      data.buffer,
      data.byteOffset,
      data.byteLength
    ).toString("utf8");
  }
  const text = asRecord(data)?.text;
  if (typeof text === "function") {
    return String(await text.call(data));
  }
  return String(data ?? "");
};

const createDirectGatewayRpcClient = async (options: {
  gatewayUrl: string;
  gatewayToken: string;
  timeoutMs: number;
  stateDir: string;
  clientVersion: string;
}): Promise<DirectGatewayRpcClient> => {
  const WebSocketConstructor = (
    globalThis as typeof globalThis & {
      WebSocket?: DirectGatewaySocketConstructor;
    }
  ).WebSocket;
  if (!WebSocketConstructor) {
    throw new PublishedRuntimeClosureError(
      "EE_OPENCLAW_LIVE_HOST_NATIVE_COMMAND_INVALID",
      "The current Node runtime does not provide a WebSocket client for direct Gateway validation."
    );
  }
  const deviceIdentity = await loadOrCreateValidationDeviceIdentity(
    options.stateDir
  );
  const socket = new WebSocketConstructor(options.gatewayUrl);
  const closeSocket = (): void => {
    try {
      socket.close();
    } catch {
      // Undici rejects reserved close codes and may reject close-before-open.
    }
  };
  const clientId = "cli";
  const clientMode = "cli";
  const role = "operator";
  const scopes = [
    "operator.admin",
    "operator.read",
    "operator.write",
    "operator.approvals",
    "operator.pairing"
  ];
  const pending = new Map<string, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout;
  }>();
  let closed = false;
  let connected = false;
  let resolveConnected!: () => void;
  let rejectConnected!: (error: Error) => void;
  const connectedPromise = new Promise<void>((resolveConnection, rejectConnection) => {
    resolveConnected = resolveConnection;
    rejectConnected = rejectConnection;
  });

  const rejectAll = (error: Error): void => {
    for (const entry of pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(error);
    }
    pending.clear();
    if (!connected) {
      rejectConnected(error);
    }
  };

  const requestRaw = (
    method: string,
    params: Record<string, unknown>
  ): Promise<unknown> => {
    if (closed) {
      return Promise.reject(new Error("Gateway WebSocket is closed."));
    }
    const id = randomUUID();
    return new Promise((resolveRequest, rejectRequest) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        rejectRequest(new Error(`Gateway request timed out for ${method}.`));
      }, options.timeoutMs);
      timer.unref();
      pending.set(id, {
        resolve: resolveRequest,
        reject: rejectRequest,
        timer
      });
      socket.send(JSON.stringify({
        type: "req",
        id,
        method,
        params
      }));
    });
  };

  socket.addEventListener("message", (event) => {
    void (async () => {
      const raw = await socketMessageText(event);
      let frame: Record<string, unknown> | null = null;
      try {
        frame = asRecord(JSON.parse(raw));
      } catch {
        return;
      }
      if (
        frame?.type === "event" &&
        frame.event === "connect.challenge"
      ) {
        const nonce = asRecord(frame.payload)?.nonce;
        if (typeof nonce !== "string" || nonce.trim().length === 0) {
          rejectAll(new Error("Gateway connect challenge did not include a nonce."));
          closeSocket();
          return;
        }
        try {
          const signedAtMs = Date.now();
          const deviceSignature = signOpenClawDeviceChallenge({
            identity: deviceIdentity,
            clientId,
            clientMode,
            role,
            scopes,
            signedAtMs,
            token: options.gatewayToken,
            nonce,
            platform: process.platform
          });
          await requestRaw("connect", {
            ...OPENCLAW_DIRECT_GATEWAY_PROTOCOL_RANGE,
            client: {
              id: clientId,
              displayName: "ExperienceEngine validation",
              version: options.clientVersion,
              platform: process.platform,
              mode: clientMode,
              instanceId: randomUUID()
            },
            caps: [],
            auth: { token: options.gatewayToken },
            role,
            scopes,
            device: {
              id: deviceIdentity.deviceId,
              publicKey: deviceSignature.publicKey,
              signature: deviceSignature.signature,
              signedAt: signedAtMs,
              nonce
            }
          });
          connected = true;
          resolveConnected();
        } catch (error) {
          rejectAll(error instanceof Error ? error : new Error(String(error)));
          closeSocket();
        }
        return;
      }
      if (frame?.type !== "res" || typeof frame.id !== "string") {
        return;
      }
      const entry = pending.get(frame.id);
      if (!entry) {
        return;
      }
      pending.delete(frame.id);
      clearTimeout(entry.timer);
      if (frame.ok === true) {
        entry.resolve(frame.payload);
      } else {
        const error = asRecord(frame.error);
        entry.reject(new Error(
          `Gateway request failed for ${String(error?.code ?? "unknown")}: ${String(
            error?.message ?? "unknown error"
          )}`
        ));
      }
    })().catch((error) => {
      rejectAll(error instanceof Error ? error : new Error(String(error)));
    });
  });
  socket.addEventListener("close", () => {
    closed = true;
    rejectAll(new Error("Gateway WebSocket closed."));
  });
  socket.addEventListener("error", () => {
    rejectAll(new Error("Gateway WebSocket failed."));
  });

  const connectTimer = setTimeout(() => {
    rejectConnected(new Error("Gateway WebSocket connect timed out."));
    closeSocket();
  }, options.timeoutMs);
  connectTimer.unref();
  try {
    await connectedPromise;
  } catch (error) {
    throw new PublishedRuntimeClosureError(
      "EE_OPENCLAW_LIVE_HOST_NATIVE_COMMAND_FAILED",
      `Direct OpenClaw Gateway connection failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  } finally {
    clearTimeout(connectTimer);
  }

  return {
    request: (method, params) => requestRaw(method, params),
    close: () => {
      closed = true;
      rejectAll(new Error("Gateway WebSocket closed by validator."));
      closeSocket();
    }
  };
};

const parseJsonCommandOutput = (options: {
  stdout: string;
  label: string;
}): unknown => {
  try {
    return JSON.parse(options.stdout.trim());
  } catch {
    throw new PublishedRuntimeClosureError(
      "EE_OPENCLAW_LIVE_HOST_NATIVE_COMMAND_INVALID",
      `OpenClaw ${options.label} did not return valid JSON.`
    );
  }
};

const parseNativeCommandGatewayResponse = (options: {
  value: unknown;
  request: ReturnType<typeof createOpenClawNativeCommandGatewayRequest>;
}): OpenClawNativeCommandResult => {
  try {
    return parseOpenClawNativeCommandGatewayResponse({
      value: options.value,
      expectedRequest: options.request
    }).runtime_json;
  } catch (error) {
    throw new PublishedRuntimeClosureError(
      "EE_OPENCLAW_LIVE_HOST_NATIVE_COMMAND_INVALID",
      `OpenClaw ${options.request.operation} Gateway command probe was invalid: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
};

const runNativeRuntimeCommandDirect = async (options: {
  timeoutMs: number;
  gatewayUrl: string;
  gatewayToken: string;
  stateDir: string;
  clientVersion: string;
  operation: OpenClawNativeOperation;
  payload?: Record<string, unknown>;
  acceptedFailureCodes?: readonly string[];
  directGatewayRpcClientFactory?: DirectGatewayRpcClientFactory;
}): Promise<OpenClawNativeCommandResult> => {
  const client = await (
    options.directGatewayRpcClientFactory ?? createDirectGatewayRpcClient
  )({
    gatewayUrl: options.gatewayUrl,
    gatewayToken: options.gatewayToken,
    timeoutMs: options.timeoutMs,
    stateDir: options.stateDir,
    clientVersion: options.clientVersion
  });
  try {
    const request = createOpenClawNativeCommandGatewayRequest({
      probeId: randomUUID(),
      operation: options.operation,
      payload: options.payload
    });
    const parsed = parseNativeCommandGatewayResponse({
      value: await client.request(
        OPENCLAW_NATIVE_COMMAND_GATEWAY_METHOD,
        request
      ),
      request
    });
    if (
      !parsed.ok &&
      !options.acceptedFailureCodes?.includes(parsed.code)
    ) {
      throw new PublishedRuntimeClosureError(
        "EE_OPENCLAW_LIVE_HOST_NATIVE_COMMAND_FAILED",
        `OpenClaw ${options.operation} command failed with ${parsed.code}.`
      );
    }
    return parsed;
  } finally {
    client.close();
  }
};

const runNativeRuntimeCommand = async (options: {
  runner: OpenClawHostCommandRunner;
  executable: string;
  env: NodeJS.ProcessEnv;
  cwd?: string;
  timeoutMs: number;
  gatewayUrl: string;
  gatewayToken: string;
  stateDir: string;
  clientVersion: string;
  operation: OpenClawNativeOperation;
  payload?: Record<string, unknown>;
  acceptedFailureCodes?: readonly string[];
  transport?: "cli" | "direct_gateway";
  directGatewayRpcClientFactory?: DirectGatewayRpcClientFactory;
}): Promise<OpenClawNativeCommandResult> => {
  if (options.transport === "direct_gateway") {
    return runNativeRuntimeCommandDirect(options);
  }
  const request = createOpenClawNativeCommandGatewayRequest({
    probeId: randomUUID(),
    operation: options.operation,
    payload: options.payload
  });
  const commandTimeoutMs = boundedOpenClawCliTimeout(
    options.timeoutMs,
    20_000
  );
  const output = await runCommand({
    runner: options.runner,
    executable: options.executable,
    args: [
      "gateway",
      "call",
      OPENCLAW_NATIVE_COMMAND_GATEWAY_METHOD,
      "--params",
      JSON.stringify(request),
      "--url",
      options.gatewayUrl,
      "--token",
      options.gatewayToken,
      "--json",
      "--timeout",
      String(commandTimeoutMs)
    ],
    env: options.env,
    cwd: options.cwd,
    timeoutMs: commandTimeoutMs
  });
  const parsed = parseNativeCommandGatewayResponse({
    value: parseJsonCommandOutput({
      stdout: output.stdout,
      label: OPENCLAW_NATIVE_COMMAND_GATEWAY_METHOD
    }),
    request
  });
  if (
    !parsed.ok &&
    !options.acceptedFailureCodes?.includes(parsed.code)
  ) {
    throw new PublishedRuntimeClosureError(
      "EE_OPENCLAW_LIVE_HOST_NATIVE_COMMAND_FAILED",
      `OpenClaw ${options.operation} command failed with ${parsed.code}.`
    );
  }
  return parsed;
};

const waitForNativeRuntimeServiceReady = async (options: Parameters<
  typeof runNativeRuntimeCommand
>[0]): Promise<void> => {
  const deadline = Date.now() + options.timeoutMs;
  let lastCode = "EE_NATIVE_OPERATION_UNAVAILABLE";
  while (Date.now() < deadline) {
    const status = await runNativeRuntimeCommand({
      ...options,
      operation: "status",
      acceptedFailureCodes: [
        "EE_NATIVE_OPERATION_UNAVAILABLE",
        "runtime_service_unavailable"
      ]
    });
    if (status.ok && status.code !== "runtime_service_unavailable") {
      return;
    }
    lastCode = status.code;
    await sleep(100);
  }
  throw new PublishedRuntimeClosureError(
    "EE_OPENCLAW_LIVE_HOST_NATIVE_COMMAND_FAILED",
    `OpenClaw package-local runtime service did not become ready before timeout; last code ${lastCode}.`
  );
};

const sameInitializationSnapshot = (
  left: OpenClawHostInitializationSnapshot,
  right: OpenClawHostInitializationSnapshot
): boolean => JSON.stringify(left) === JSON.stringify(right);

const resolveReportedOpenClawPath = (
  value: string,
  homeDirectory: string
): string => {
  const trimmed = value.trim();
  if (trimmed === "~") {
    return resolve(homeDirectory);
  }
  if (trimmed.startsWith("~/") || trimmed.startsWith("~\\")) {
    return resolve(homeDirectory, trimmed.slice(2));
  }
  return resolve(trimmed);
};

const waitForGatewayHealth = async (options: {
  runner: OpenClawHostCommandRunner;
  executable: string;
  env: NodeJS.ProcessEnv;
  cwd?: string;
  timeoutMs: number;
  gatewayUrl: string;
  gatewayToken: string;
  stateDir: string;
  clientVersion: string;
  transport: "cli" | "direct_gateway";
  directGatewayRpcClientFactory?: DirectGatewayRpcClientFactory;
}): Promise<void> => {
  const deadline = Date.now() + options.timeoutMs;
  const probeTimeoutMs = boundedOpenClawCliTimeout(
    options.timeoutMs,
    10_000
  );
  let lastError: unknown;
  while (Date.now() < deadline) {
    let directClient: DirectGatewayRpcClient | null = null;
    try {
      if (options.transport === "direct_gateway") {
        directClient = await (
          options.directGatewayRpcClientFactory ?? createDirectGatewayRpcClient
        )({
          gatewayUrl: options.gatewayUrl,
          gatewayToken: options.gatewayToken,
          timeoutMs: Math.min(options.timeoutMs, 10_000),
          stateDir: options.stateDir,
          clientVersion: options.clientVersion
        });
        await directClient.request("health", {});
      } else {
        await runCommand({
          ...options,
          args: [
            "gateway",
            "call",
            "health",
            "--url",
            options.gatewayUrl,
            "--token",
            options.gatewayToken,
            "--json"
          ],
          timeoutMs: probeTimeoutMs
        });
      }
      return;
    } catch (error) {
      lastError = error;
      await sleep(250);
    } finally {
      directClient?.close();
    }
  }
  throw new PublishedRuntimeClosureError(
    "EE_OPENCLAW_LIVE_HOST_GATEWAY_UNHEALTHY",
    `OpenClaw Gateway did not become healthy: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  );
};

const waitForGatewayReady = async (options: {
  gateway: OpenClawGatewayProcess;
  runner: OpenClawHostCommandRunner;
  executable: string;
  env: NodeJS.ProcessEnv;
  cwd?: string;
  timeoutMs: number;
  gatewayUrl: string;
  gatewayToken: string;
  stateDir: string;
  clientVersion: string;
  transport: "cli" | "direct_gateway";
  directGatewayRpcClientFactory?: DirectGatewayRpcClientFactory;
}): Promise<void> => {
  try {
    await Promise.race([
      waitForGatewayHealth(options),
      options.gateway.waitForExit().then((exit) => {
        throw new PublishedRuntimeClosureError(
          "EE_OPENCLAW_LIVE_HOST_GATEWAY_EXITED",
          `OpenClaw Gateway exited before health became ready (code=${String(
            exit.code
          )}, signal=${String(exit.signal)}): ${
            exit.stderr.trim() || exit.stdout.trim() || "no process output"
          }`
        );
      })
    ]);
  } catch (error) {
    if (
      error instanceof PublishedRuntimeClosureError &&
      error.code === "EE_OPENCLAW_LIVE_HOST_GATEWAY_EXITED"
    ) {
      throw error;
    }
    const output = options.gateway.readOutput();
    const sanitize = (value: string): string => value
      .replaceAll(options.gatewayToken, "<redacted-gateway-token>")
      .trim()
      .slice(-16_000);
    throw new PublishedRuntimeClosureError(
      "EE_OPENCLAW_LIVE_HOST_GATEWAY_UNHEALTHY",
      `OpenClaw Gateway did not become healthy. Process stdout: ${
        sanitize(output.stdout) || "<empty>"
      }; process stderr: ${
        sanitize(output.stderr) || "<empty>"
      }; health failure: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
};

const copySeedAgentAuth = async (options: {
  seedConfigPath?: string;
  seedAgentAuthPath?: string;
  stateDir: string;
  agentId: string;
}): Promise<{ migrationRequired: boolean }> => {
  const agentDirectory = options.seedConfigPath
    ? join(
        dirname(options.seedConfigPath),
        "agents",
        options.agentId,
        "agent"
      )
    : null;
  const legacySource = options.seedAgentAuthPath ?? (
    agentDirectory ? join(agentDirectory, "auth-profiles.json") : null
  );
  const sqliteSource = agentDirectory
    ? join(agentDirectory, "openclaw-agent.sqlite")
    : null;
  if (!legacySource && !sqliteSource) {
    return { migrationRequired: false };
  }
  const destinationDirectory = join(
    options.stateDir,
    "agents",
    options.agentId,
    "agent"
  );
  await mkdir(destinationDirectory, { recursive: true });
  let legacyAuthCopied = false;
  let sqliteAuthCopied = false;
  if (legacySource) {
    try {
      await access(legacySource);
      await copyFile(
        legacySource,
        join(destinationDirectory, "auth-profiles.json")
      );
      legacyAuthCopied = true;
    } catch (error) {
      if (
        !error ||
        typeof error !== "object" ||
        !("code" in error) ||
        (error as { code?: unknown }).code !== "ENOENT"
      ) {
        throw error;
      }
      // Current OpenClaw hosts may use only the SQLite agent store.
    }
  }
  if (sqliteSource) {
    try {
      await access(sqliteSource);
      const sourceDatabase = new DatabaseSync(sqliteSource, {
        readOnly: true
      });
      try {
        const hasAuthProfileStore = sourceDatabase.prepare(
          "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'auth_profile_store'"
        ).get() !== undefined;
        const hasStoredAuthProfiles = !hasAuthProfileStore ||
          sourceDatabase.prepare(
            "SELECT 1 FROM auth_profile_store LIMIT 1"
          ).get() !== undefined;
        if (!legacyAuthCopied || hasStoredAuthProfiles) {
          await backup(
            sourceDatabase,
            join(destinationDirectory, "openclaw-agent.sqlite")
          );
          sqliteAuthCopied = true;
        }
      } finally {
        sourceDatabase.close();
      }
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code?: unknown }).code === "ENOENT"
      ) {
        return { migrationRequired: legacyAuthCopied && !sqliteAuthCopied };
      }
      throw error;
    }
  }
  return { migrationRequired: legacyAuthCopied && !sqliteAuthCopied };
};

const readVersion = async (options: {
  runner: OpenClawHostCommandRunner;
  executable: string;
  env: NodeJS.ProcessEnv;
  cwd?: string;
}): Promise<string> => (
  await runCommand({
    ...options,
    args: ["--version"],
    timeoutMs: 15_000
  })
).stdout.trim();

const buildOpenClawPluginInstallArgs = (options: {
  installSource: string;
  acknowledgeClawHubRisk: boolean;
  approveUnsafeInstall: boolean;
}): string[] => [
  "plugins",
  "install",
  options.installSource,
  ...(options.acknowledgeClawHubRisk
    ? ["--acknowledge-clawhub-risk"]
    : []),
  ...(options.approveUnsafeInstall
    ? ["--dangerously-force-unsafe-install"]
    : [])
];

const installValidatedArtifact = async (options: {
  runner: OpenClawHostCommandRunner;
  executable: string;
  installSource: string;
  acknowledgeClawHubRisk: boolean;
  env: NodeJS.ProcessEnv;
  cwd?: string;
  approveHostSecurityScan: boolean;
  timeoutMs: number;
  onProgress?: (stage: string) => void;
}): Promise<{
  security_scan_status: OpenClawLiveHostEnvironment["security_scan_status"];
  security_scan_summary_digest: string | null;
}> => {
  try {
    options.onProgress?.("host_security_scan_started");
    await runCommand({
      ...options,
      args: buildOpenClawPluginInstallArgs({
        installSource: options.installSource,
        acknowledgeClawHubRisk: options.acknowledgeClawHubRisk,
        approveUnsafeInstall: false
      }),
      timeoutMs: options.timeoutMs
    });
    return {
      security_scan_status: "not_required",
      security_scan_summary_digest: null
    };
  } catch (error) {
    if (!isOpenClawSecurityApprovalRequired(error)) {
      throw error;
    }
    options.onProgress?.("host_security_scan_rejected");
    const digest = digestOpenClawSecurityScanSummary(error);
    if (!options.approveHostSecurityScan) {
      throw new PublishedRuntimeClosureError(
        "EE_OPENCLAW_SECURITY_APPROVAL_REQUIRED",
        `OpenClaw security approval is required for this exact artifact (scan ${digest}).`
      );
    }
    options.onProgress?.("approved_artifact_install_started");
    await runCommand({
      ...options,
      args: buildOpenClawPluginInstallArgs({
        installSource: options.installSource,
        acknowledgeClawHubRisk: options.acknowledgeClawHubRisk,
        approveUnsafeInstall: true
      }),
      timeoutMs: options.timeoutMs
    });
    options.onProgress?.("approved_artifact_install_completed");
    return {
      security_scan_status: "approved",
      security_scan_summary_digest: digest
    };
  }
};

const defaultInstalledPackageVerifier: OpenClawInstalledPackageVerifier = async (
  installedRoot
) => {
  const closure = assertRuntimeClosureManifest(installedRoot);
  if (!closure.packageBuildId || !closure.closureManifestDigest) {
    throw new PublishedRuntimeClosureError(
      "EE_PUBLISHED_CLOSURE_SCHEMA_INVALID",
      "Installed OpenClaw package closure did not expose build and manifest identity."
    );
  }
  return {
    packageBuildId: closure.packageBuildId,
    closureManifestDigest: closure.closureManifestDigest
  };
};

const defaultPublishedAttestationIssuer: OpenClawPublishedAttestationIssuer = async (
  options
) => {
  const home = await initializeRuntimeHomeIdentity({
    writer: "gateway_service_controller",
    explicitOpenClawHome: resolve(options.runtimeHome),
    now: options.now
  });
  await createOrAdoptRuntimeInstallAttestation({
    canonicalHome: home.resolution.resolvedHome,
    integrityKey: home.integrityKey,
    content: {
      install_origin: options.artifact.published_channel === "npm"
        ? "published_npm_attested"
        : "published_clawhub_attested",
      package_name: options.artifact.package_name,
      package_version: options.artifact.package_version,
      package_build_id: options.packageBuildId,
      closure_manifest_digest: options.closureManifestDigest,
      installed_root_fingerprint: fingerprintRuntimeInstallPath(options.installedRoot),
      host_state_dir_fingerprint: fingerprintRuntimeInstallPath(options.stateDir),
      home_id: home.homeIdentity.home_id,
      database_path_fingerprint: fingerprintRuntimeInstallPath(options.sqlitePath),
      openclaw_version: options.openclawVersion,
      node_version: process.version,
      artifact_integrity: options.artifact.artifact_integrity,
      registry_record_identity: options.artifact.registry_record_identity,
      security_approval: options.security.security_scan_status === "approved"
        ? {
            scan_status: "approved",
            scan_summary_digest: options.security.security_scan_summary_digest,
            approval_method: "explicit_cli",
            approved_at: options.now().toISOString()
          }
        : {
            scan_status: "not_required",
            scan_summary_digest: null,
            approval_method: null,
            approved_at: null
          },
      issued_by: "published_validator",
      issued_at: options.now().toISOString()
    }
  });
};

export const runOpenClawHostValidation = async (options: {
  artifact: MaterializedPublishedArtifact;
  openclawExecutable: string;
  validationRoot: string;
  runtimeHome: string;
  sqlitePath: string;
  pluginConfig: Record<string, unknown>;
  authorityCollector: OpenClawHostAuthorityCollector;
  seedConfigPath?: string;
  seedAgentAuthPath?: string;
  installSource?: string;
  acknowledgeClawHubRisk?: boolean;
  expectedInstalledPackageRoot?: string;
  agentId?: string;
  agentMessage?: string;
  gatewayPort?: number;
  approveHostSecurityScan?: boolean;
  commandRunner?: OpenClawHostCommandRunner;
  gatewaySpawner?: OpenClawGatewaySpawner;
  installedPackageVerifier?: OpenClawInstalledPackageVerifier;
  publishedAttestationIssuer?: OpenClawPublishedAttestationIssuer;
  prepareRuntimeAuthority: (options: {
    installedRoot: string;
    stateDir: string;
    runtimeHome: string;
    sqlitePath: string;
    artifact: MaterializedPublishedArtifact;
    openclawVersion: string;
  }) => Promise<{ packageGenerationId: string }>;
  cleanupRuntimeFixture?: () => Promise<void>;
  hostHomeDir?: string;
  nativeCommandTransport?: "cli" | "direct_gateway";
  directGatewayRpcClientFactory?: DirectGatewayRpcClientFactory;
  onProgress?: (stage: string) => void;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  now?: () => Date;
}): Promise<PublishedLiveActivationEvidence> => {
  const progress = (stage: string): void => {
    options.onProgress?.(stage);
  };
  const validationRoot = resolve(options.validationRoot);
  const stateDir = join(validationRoot, "openclaw-state");
  const configPath = join(stateDir, "openclaw.json");
  const installInputDir = join(validationRoot, "install-input");
  const installArtifactPath = join(
    installInputDir,
    "experienceengine-candidate.tgz"
  );
  await mkdir(stateDir, { recursive: true });
  await mkdir(installInputDir, { recursive: true });
  await copyFile(
    resolve(options.artifact.artifact_path),
    installArtifactPath
  );
  await access(installArtifactPath);
  progress("artifact_materialized");
  if (options.seedConfigPath) {
    await copyFile(options.seedConfigPath, configPath);
  }
  const agentId = options.agentId ?? "main";
  const seedAgentAuth = await copySeedAgentAuth({
    seedConfigPath: options.seedConfigPath,
    seedAgentAuthPath: options.seedAgentAuthPath,
    stateDir,
    agentId
  });
  const gatewayPort = options.gatewayPort ?? 19171;
  const gatewayUrl = `ws://127.0.0.1:${gatewayPort}`;
  const gatewayToken = randomBytes(32).toString("hex");
  const env: NodeJS.ProcessEnv = {
    ...(options.env ?? process.env),
    OPENCLAW_STATE_DIR: stateDir,
    OPENCLAW_CONFIG_PATH: configPath,
    OPENCLAW_GATEWAY_TOKEN: gatewayToken,
    OPENCLAW_GATEWAY_URL: gatewayUrl,
    EXPERIENCE_ENGINE_HOME: resolve(options.runtimeHome),
    NODE_PATH: "",
    NODE_OPTIONS: ""
  };
  const runner = options.commandRunner ?? defaultCommandRunner;
  const spawner = options.gatewaySpawner ?? defaultGatewaySpawner;
  const timeoutMs = options.timeoutMs ?? (
    process.platform === "win32" ? 600_000 : 180_000
  );
  const nativeCommandTransport = options.nativeCommandTransport ?? (
    process.platform === "win32" ? "direct_gateway" : "cli"
  );
  const executable = resolve(options.openclawExecutable);
  const cwd = validationRoot;
  if (seedAgentAuth.migrationRequired) {
    await runCommand({
      runner,
      executable,
      args: [
        "doctor",
        "--non-interactive",
        "--yes",
        "--no-workspace-suggestions"
      ],
      env,
      cwd,
      timeoutMs
    });
    progress("seed_agent_auth_migrated");
  }
  const openclawVersion = await readVersion({ runner, executable, env, cwd });
  progress("openclaw_version_resolved");
  const security = await installValidatedArtifact({
    runner,
    executable,
    installSource: options.installSource ?? installArtifactPath,
    acknowledgeClawHubRisk: options.acknowledgeClawHubRisk === true,
    env,
    cwd,
    approveHostSecurityScan: options.approveHostSecurityScan === true,
    timeoutMs,
    onProgress: progress
  });
  progress("artifact_installed");
  await runCommand({
    runner,
    executable,
    args: ["plugins", "enable", "experienceengine"],
    env,
    cwd,
    timeoutMs
  });
  await runCommand({
    runner,
    executable,
    args: ["config", "set", "gateway.port", String(gatewayPort), "--json"],
    env,
    cwd,
    timeoutMs
  });
  await runCommand({
    runner,
    executable,
    args: ["config", "set", "gateway.auth.mode", "token"],
    env,
    cwd,
    timeoutMs
  });
  await runCommand({
    runner,
    executable,
    args: [
      "config",
      "set",
      "gateway.auth.token",
      JSON.stringify(gatewayToken),
      "--json"
    ],
    env,
    cwd,
    timeoutMs
  });
  await runCommand({
    runner,
    executable,
    args: [
      "config",
      "set",
      "plugins.entries.experienceengine.config",
      JSON.stringify(options.pluginConfig),
      "--json"
    ],
    env,
    cwd,
    timeoutMs
  });
  await runCommand({
    runner,
    executable,
    args: ["config", "set", "gateway.mode", "local"],
    env,
    cwd,
    timeoutMs
  });
  const pluginInfoOutput = await runCommand({
    runner,
    executable,
    args: ["plugins", "info", "experienceengine"],
    env,
    cwd,
    timeoutMs
  });
  const pluginInfo = parseOpenClawPluginInfo(pluginInfoOutput.stdout);
  if (!pluginInfo.installPath) {
    throw new PublishedRuntimeClosureError(
      "EE_OPENCLAW_LIVE_HOST_PLUGIN_NOT_INSTALLED",
      "OpenClaw did not report the installed ExperienceEngine package root."
    );
  }
  const installedRoot = resolveReportedOpenClawPath(
    pluginInfo.installPath,
    options.hostHomeDir ?? homedir()
  );
  let verifiedPackage = await (
    options.installedPackageVerifier ?? defaultInstalledPackageVerifier
  )(installedRoot);
  if (options.expectedInstalledPackageRoot) {
    const expectedPackage = await defaultInstalledPackageVerifier(
      resolve(options.expectedInstalledPackageRoot)
    );
    const installedPackage = await defaultInstalledPackageVerifier(installedRoot);
    assertOpenClawInstalledPackageMatchesExpected(
      installedPackage,
      expectedPackage
    );
    verifiedPackage = installedPackage;
  }
  progress("installed_package_verified");
  const now = options.now ?? (() => new Date());
  await (
    options.publishedAttestationIssuer ?? defaultPublishedAttestationIssuer
  )({
    installedRoot,
    stateDir,
    runtimeHome: options.runtimeHome,
    sqlitePath: options.sqlitePath,
    openclawVersion,
    artifact: options.artifact,
    packageBuildId: verifiedPackage.packageBuildId,
    closureManifestDigest: verifiedPackage.closureManifestDigest,
    security,
    now
  });
  const preparedRuntimeAuthority = await options.prepareRuntimeAuthority({
    installedRoot,
    stateDir,
    runtimeHome: options.runtimeHome,
    sqlitePath: options.sqlitePath,
    artifact: options.artifact,
    openclawVersion
  });
  progress("runtime_authority_prepared");

  const gatewayArgs = [
    "gateway",
    "run",
    "--allow-unconfigured",
    "--auth",
    "token",
    "--token",
    gatewayToken,
    "--bind",
    "loopback",
    "--port",
    String(gatewayPort),
    "--verbose"
  ];
  progress("gateway_spawn_started");
  let gateway = await spawner({ executable, args: gatewayArgs, env, cwd });
  progress("gateway_spawned");
  try {
    await waitForGatewayReady({
      gateway,
      runner,
      executable,
      env,
      cwd,
      timeoutMs,
      gatewayUrl,
      gatewayToken,
      stateDir,
      clientVersion: options.artifact.package_version,
      transport: nativeCommandTransport,
      directGatewayRpcClientFactory: options.directGatewayRpcClientFactory
    });
    progress("gateway_ready");
    const loadedInfo = parseOpenClawPluginInfo((await runCommand({
      runner,
      executable,
      args: ["plugins", "info", "experienceengine"],
      env,
      cwd,
      timeoutMs
    })).stdout);
    if (loadedInfo.status?.toLowerCase() !== "loaded") {
      throw new PublishedRuntimeClosureError(
        "EE_OPENCLAW_LIVE_HOST_PLUGIN_NOT_LOADED",
        `OpenClaw plugin status is ${loadedInfo.status ?? "unknown"}, not loaded.`
      );
    }
    progress("plugin_loaded");
    await waitForNativeRuntimeServiceReady({
      runner,
      executable,
      env,
      cwd,
      timeoutMs,
      gatewayUrl,
      gatewayToken,
      stateDir,
      clientVersion: options.artifact.package_version,
      operation: "status",
      transport: nativeCommandTransport,
      directGatewayRpcClientFactory: options.directGatewayRpcClientFactory
    });
    progress("runtime_service_ready");
    const initializationBefore =
      await options.authorityCollector.captureInitializationSnapshot({
        sqlitePath: options.sqlitePath,
        runtimeHome: options.runtimeHome,
        timeoutMs
      });
    const prepared = await runNativeRuntimeCommand({
      runner,
      executable,
      env,
      cwd,
      timeoutMs,
      gatewayUrl,
      gatewayToken,
      stateDir,
      clientVersion: options.artifact.package_version,
      operation: "prepare_package_activation",
      transport: nativeCommandTransport,
      directGatewayRpcClientFactory: options.directGatewayRpcClientFactory
    });
    progress("native_activation_prepared");
    if (prepared.code !== "package_activation_request_prepared") {
      throw new PublishedRuntimeClosureError(
        "EE_OPENCLAW_LIVE_HOST_NATIVE_COMMAND_FAILED",
        `OpenClaw prepare_package_activation returned ${prepared.code}.`
      );
    }
    const preparedPayload = asRecord(prepared.result);
    const controlRequestId = preparedPayload?.control_request_id;
    const authorizationId = preparedPayload?.authorization_id;
    if (
      preparedPayload?.operation !== "initialize_package_activation" ||
      preparedPayload.package_generation_id !==
        preparedRuntimeAuthority.packageGenerationId ||
      preparedPayload.expected_projection_revision !==
        initializationBefore.projection_revision ||
      preparedPayload.expected_launch_revision !==
        initializationBefore.launch_revision ||
      typeof controlRequestId !== "string" ||
      controlRequestId.trim().length === 0 ||
      typeof authorizationId !== "string" ||
      authorizationId.trim().length === 0 ||
      preparedPayload.mutates_authority !== false
    ) {
      throw new PublishedRuntimeClosureError(
        "EE_OPENCLAW_LIVE_HOST_NATIVE_COMMAND_INVALID",
        "OpenClaw prepare_package_activation did not return the exact current package generation, revisions, ids, and read-only marker."
      );
    }
    const initializationAfterPrepare =
      await options.authorityCollector.captureInitializationSnapshot({
        sqlitePath: options.sqlitePath,
        runtimeHome: options.runtimeHome,
        timeoutMs
      });
    if (!sameInitializationSnapshot(
      initializationBefore,
      initializationAfterPrepare
    )) {
      throw new PublishedRuntimeClosureError(
        "EE_OPENCLAW_LIVE_HOST_NATIVE_COMMAND_AUTHORITY_MUTATED",
        "OpenClaw prepare_package_activation mutated package/process activation authority."
      );
    }
    const initializationPayload = {
      package_generation_id: preparedRuntimeAuthority.packageGenerationId,
      expected_projection_revision:
        preparedPayload.expected_projection_revision,
      expected_launch_revision: preparedPayload.expected_launch_revision,
      control_request_id: controlRequestId,
      authorization_id: authorizationId
    };
    const initialized = await runNativeRuntimeCommand({
      runner,
      executable,
      env,
      cwd,
      timeoutMs,
      gatewayUrl,
      gatewayToken,
      stateDir,
      clientVersion: options.artifact.package_version,
      operation: "initialize_package_activation",
      payload: initializationPayload,
      transport: nativeCommandTransport,
      directGatewayRpcClientFactory: options.directGatewayRpcClientFactory
    });
    progress("native_activation_initialized");
    const initializedPayload = asRecord(initialized.result);
    if (
      initialized.code !== "package_activation_initialized" ||
      initializedPayload?.replayed !== false ||
      typeof initializedPayload.projection_revision !== "number"
    ) {
      throw new PublishedRuntimeClosureError(
        "EE_OPENCLAW_LIVE_HOST_NATIVE_COMMAND_INVALID",
        "OpenClaw initialize_package_activation did not commit one new exact-CAS initialization."
      );
    }
    const replayed = await runNativeRuntimeCommand({
      runner,
      executable,
      env,
      cwd,
      timeoutMs,
      gatewayUrl,
      gatewayToken,
      stateDir,
      clientVersion: options.artifact.package_version,
      operation: "initialize_package_activation",
      payload: initializationPayload,
      transport: nativeCommandTransport,
      directGatewayRpcClientFactory: options.directGatewayRpcClientFactory
    });
    progress("native_activation_replayed");
    const replayedPayload = asRecord(replayed.result);
    if (
      replayed.code !== "package_activation_initialized" ||
      replayedPayload?.replayed !== true ||
      replayedPayload.projection_revision !==
        initializedPayload.projection_revision
    ) {
      throw new PublishedRuntimeClosureError(
        "EE_OPENCLAW_LIVE_HOST_NATIVE_COMMAND_INVALID",
        "OpenClaw initialize_package_activation did not replay the original control result idempotently."
      );
    }
    await options.authorityCollector.verifyInitializationIdempotency({
      sqlitePath: options.sqlitePath,
      runtimeHome: options.runtimeHome,
      controlRequestId,
      authorizationId,
      expectedPackageGenerationId:
        preparedRuntimeAuthority.packageGenerationId,
      timeoutMs
    });
    const agentArgs = ["agent"];
    if (agentId) {
      agentArgs.push("--agent", agentId);
    }
    agentArgs.push(
      "--session-id",
      `ee-validation-${Date.now()}`,
      "--message",
      options.agentMessage ??
        "Inspect the current workspace, perform one bounded read-only tool action, and summarize the result.",
      "--json",
      "--timeout",
      String(Math.max(30, Math.floor(timeoutMs / 1000)))
    );
    const agentResult = await runCommand({
      runner,
      executable,
      args: agentArgs,
      env,
      cwd,
      timeoutMs
    });
    if (!agentResult.stdout.trim()) {
      throw new PublishedRuntimeClosureError(
        "EE_OPENCLAW_LIVE_HOST_AGENT_TURN_FAILED",
        "OpenClaw real agent turn returned no result."
      );
    }
    progress("agent_turn_completed");
    const active = await options.authorityCollector.captureActiveEvidence({
      sqlitePath: options.sqlitePath,
      runtimeHome: options.runtimeHome,
      timeoutMs
    });
    progress("runtime_evidence_captured");
    await gateway.stop();
    await options.authorityCollector.captureShutdownEvidence({
      sqlitePath: options.sqlitePath,
      runtimeHome: options.runtimeHome,
      timeoutMs
    });
    progress("first_shutdown_captured");
    gateway = await spawner({ executable, args: gatewayArgs, env, cwd });
    await waitForGatewayReady({
      gateway,
      runner,
      executable,
      env,
      cwd,
      timeoutMs,
      gatewayUrl,
      gatewayToken,
      stateDir,
      clientVersion: options.artifact.package_version,
      transport: nativeCommandTransport,
      directGatewayRpcClientFactory: options.directGatewayRpcClientFactory
    });
    progress("gateway_restart_ready");
    await options.authorityCollector.verifyRestartRecovery({
      sqlitePath: options.sqlitePath,
      runtimeHome: options.runtimeHome,
      prior: active,
      timeoutMs
    });
    progress("restart_recovered");
    await gateway.stop();
    const shutdown = await options.authorityCollector.captureShutdownEvidence({
      sqlitePath: options.sqlitePath,
      runtimeHome: options.runtimeHome,
      timeoutMs
    });
    progress("final_shutdown_captured");
    progress("complete");
    return {
      evidence_schema_version: LIVE_ACTIVATION_EVIDENCE_VERSION,
      evidence_class: "live_host",
      published_channel: options.artifact.published_channel,
      package_name: options.artifact.package_name,
      package_version: options.artifact.package_version,
      artifact_integrity: options.artifact.artifact_integrity,
      registry_record_identity: options.artifact.registry_record_identity,
      host_environment: {
        openclaw_version: openclawVersion,
        node_version: process.version,
        platform: `${process.platform}-${process.arch}`,
        install_method: "openclaw_plugins_install",
        security_scan_status: security.security_scan_status,
        security_scan_summary_digest: security.security_scan_summary_digest,
        plugin_service_registered: true,
        native_activation_prepare_observed: true,
        native_activation_prepare_read_only: true,
        native_activation_initialize_observed: true,
        native_activation_idempotent_replay_observed: true,
        real_agent_turn_observed: true,
        gateway_restart_recovered: true
      },
      activation: active.activation,
      queue: active.queue,
      shutdown,
      interaction_active: true,
      learning_runtime_active: true,
      production_learning_ready: active.production_learning_ready,
      verified_at: now().toISOString()
    };
  } finally {
    progress("cleanup_started");
    await gateway.stop().catch(() => undefined);
    await options.cleanupRuntimeFixture?.().catch(() => undefined);
    await rm(join(validationRoot, "gateway.pid"), { force: true }).catch(() => undefined);
    progress("cleanup_completed");
  }
};

export const OPENCLAW_HOST_VALIDATION_RUNNER_CONTRACT = Object.freeze({
  real_openclaw_install_required: true,
  real_gateway_required: true,
  plugin_service_registration_required: true,
  real_agent_turn_required: true,
  authoritative_sqlite_collector_required: true,
  gateway_restart_recovery_required: true,
  installed_artifact_smoke_substitution_allowed: false,
  explicit_security_approval_required_when_blocked: true,
  isolated_gateway_port_and_token_required: true,
  seed_agent_auth_is_copied_only_into_temporary_state: true,
  native_activation_prepare_command_required: true,
  native_activation_initialize_command_required: true,
  native_activation_prepare_must_be_read_only: true,
  native_activation_initialize_replay_required: true,
  gateway_lifecycle_stop_drives_runtime_drain: true,
  windows_batch_shim_uses_validated_node_entrypoint: true,
  windows_gateway_health_uses_direct_gateway_rpc: true,
  windows_native_commands_use_direct_gateway_rpc: true,
  native_commands_bypass_agent_model: true,
  native_command_gateway_probe_identity_required: true,
  stale_native_command_gateway_probe_rejected: true,
  direct_gateway_protocol_range_is_negotiated: true,
  channel_native_install_closure_binding_required: true,
  shell_true_allowed: false
});
