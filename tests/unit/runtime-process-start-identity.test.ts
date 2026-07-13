import { describe, expect, it, vi } from "vitest";
import {
  createOperatingSystemProcessStartTokenResolver,
  parseLinuxProcStartTime
} from "../../src/runtime/activation/process-identity.js";

describe("operating-system process-start identity resolver", () => {
  it("parses Linux stat field 22 even when the command contains spaces and parentheses", () => {
    const stat = "123 (node worker (test)) S 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 424242 20";
    expect(parseLinuxProcStartTime(stat)).toBe("424242");
  });

  it("reads the Linux process start tick from procfs", () => {
    const readTextFile = vi.fn(() =>
      "321 (node) S 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 987654 20"
    );
    const resolver = createOperatingSystemProcessStartTokenResolver({
      platform: "linux",
      readTextFile
    });
    expect(resolver(321)).toBe("linux-proc-start:987654");
    expect(readTextFile).toHaveBeenCalledWith("/proc/321/stat");
  });

  it("reads Windows UTC start ticks without generating an application token", () => {
    const executeText = vi.fn(() => "638879123456789012\r\n");
    const resolver = createOperatingSystemProcessStartTokenResolver({
      platform: "win32",
      executeText
    });
    expect(resolver(456)).toBe("windows-start-ticks:638879123456789012");
    expect(executeText).toHaveBeenCalledWith(
      "powershell.exe",
      expect.arrayContaining(["(Get-Process -Id 456 -ErrorAction Stop).StartTime.ToUniversalTime().Ticks"])
    );
  });

  it("normalizes the macOS ps start-time projection", () => {
    const resolver = createOperatingSystemProcessStartTokenResolver({
      platform: "darwin",
      executeText: () => "Sun  Jul 12 00:00:01 2026\n"
    });
    expect(resolver(789)).toBe("darwin-ps-start:Sun Jul 12 00:00:01 2026");
  });

  it("fails closed for invalid pid, malformed evidence, or unsupported platforms", () => {
    const linux = createOperatingSystemProcessStartTokenResolver({
      platform: "linux",
      readTextFile: () => "malformed"
    });
    expect(() => linux(10)).toThrowError(/terminated command field/u);
    expect(() => linux(0)).toThrowError(/positive process id/u);
    const unsupported = createOperatingSystemProcessStartTokenResolver({
      platform: "aix"
    });
    expect(() => unsupported(10)).toThrowError(/unsupported on aix/u);
  });
});
