import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearGoogleAdcTokenCache, resolveGoogleAdcAccessToken } from "../../src/distillation/providers/google-adc.js";

const tempDirs: string[] = [];

afterEach(() => {
  clearGoogleAdcTokenCache();
  while (tempDirs.length) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe("google adc token resolution", () => {
  it("refreshes an authorized_user token and caches it", async () => {
    const dir = mkdtempSync(join(tmpdir(), "experienceengine-google-adc-"));
    tempDirs.push(dir);
    const adcPath = join(dir, "application_default_credentials.json");
    writeFileSync(
      adcPath,
      JSON.stringify({
        type: "authorized_user",
        client_id: "client-id",
        client_secret: "client-secret",
        refresh_token: "refresh-token"
      }),
      "utf8"
    );

    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: "adc-access-token",
        expires_in: 3600
      })
    });

    const first = await resolveGoogleAdcAccessToken({
      env: {
        GOOGLE_APPLICATION_CREDENTIALS: adcPath
      },
      fetchImpl: fetchImpl as unknown as typeof fetch
    });
    const second = await resolveGoogleAdcAccessToken({
      env: {
        GOOGLE_APPLICATION_CREDENTIALS: adcPath
      },
      fetchImpl: fetchImpl as unknown as typeof fetch
    });

    expect(first).toBe("adc-access-token");
    expect(second).toBe("adc-access-token");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});
