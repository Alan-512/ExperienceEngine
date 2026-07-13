import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { RuntimeActivationError } from "./errors.js";
import type { ProcessStartTokenResolver } from "./supervisor-launcher.js";

type ProcessStartIdentityDependencies = {
  platform?: NodeJS.Platform;
  readTextFile?: (path: string) => string;
  executeText?: (executable: string, args: string[]) => string;
};

const defaultReadTextFile = (path: string): string =>
  readFileSync(path, "utf8");

const defaultExecuteText = (executable: string, args: string[]): string =>
  execFileSync(executable, args, {
    encoding: "utf8",
    windowsHide: true,
    stdio: ["ignore", "pipe", "ignore"]
  });

export const parseLinuxProcStartTime = (stat: string): string => {
  const closeParen = stat.lastIndexOf(")");
  if (closeParen < 0) {
    throw new RuntimeActivationError(
      "EE_PACKAGE_ACTIVATION_INVALID",
      "Linux process stat does not contain a terminated command field."
    );
  }
  const fieldsAfterCommand = stat.slice(closeParen + 1).trim().split(/\s+/u);
  const startTime = fieldsAfterCommand[19];
  if (!startTime || !/^\d+$/u.test(startTime)) {
    throw new RuntimeActivationError(
      "EE_PACKAGE_ACTIVATION_INVALID",
      "Linux process stat does not contain a valid start-time tick."
    );
  }
  return startTime;
};

const assertPositivePid = (processId: number): void => {
  if (!Number.isSafeInteger(processId) || processId <= 0) {
    throw new RuntimeActivationError(
      "EE_PACKAGE_ACTIVATION_INVALID",
      "Process-start identity resolution requires a positive process id."
    );
  }
};

export const createOperatingSystemProcessStartTokenResolver = (
  dependencies: ProcessStartIdentityDependencies = {}
): ProcessStartTokenResolver => {
  const platform = dependencies.platform ?? process.platform;
  const readTextFile = dependencies.readTextFile ?? defaultReadTextFile;
  const executeText = dependencies.executeText ?? defaultExecuteText;
  return (processId) => {
    assertPositivePid(processId);
    if (platform === "linux") {
      const startTime = parseLinuxProcStartTime(
        readTextFile(`/proc/${processId}/stat`)
      );
      return `linux-proc-start:${startTime}`;
    }
    if (platform === "win32") {
      const ticks = executeText("powershell.exe", [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `(Get-Process -Id ${processId} -ErrorAction Stop).StartTime.ToUniversalTime().Ticks`
      ]).trim();
      if (!/^\d+$/u.test(ticks)) {
        throw new RuntimeActivationError(
          "EE_PACKAGE_ACTIVATION_INVALID",
          "Windows process start time could not be resolved to UTC ticks."
        );
      }
      return `windows-start-ticks:${ticks}`;
    }
    if (platform === "darwin") {
      const startedAt = executeText("ps", [
        "-p",
        String(processId),
        "-o",
        "lstart="
      ]).trim().replace(/\s+/gu, " ");
      if (startedAt.length === 0) {
        throw new RuntimeActivationError(
          "EE_PACKAGE_ACTIVATION_INVALID",
          "macOS process start time could not be resolved."
        );
      }
      return `darwin-ps-start:${startedAt}`;
    }
    throw new RuntimeActivationError(
      "EE_PACKAGE_ACTIVATION_INVALID",
      `Operating-system process-start identity resolution is unsupported on ${platform}.`
    );
  };
};

export const OPERATING_SYSTEM_PROCESS_START_IDENTITY_CONTRACT = Object.freeze({
  synthetic_tokens_allowed: false,
  supported_platforms: Object.freeze(["win32", "linux", "darwin"] as const),
  linux_source: "/proc/<pid>/stat field 22",
  windows_source: "Get-Process StartTime UTC ticks",
  darwin_source: "ps lstart"
});
