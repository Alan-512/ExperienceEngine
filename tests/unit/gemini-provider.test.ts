import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach } from "vitest";
import { describe, expect, it } from "vitest";
import { geminiDistillerProvider } from "../../src/distillation/providers/gemini.js";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe("gemini provider auth modes", () => {
  it("requires GEMINI_API_KEY for api_key auth mode", () => {
    const resolved = geminiDistillerProvider.resolve({
      EXPERIENCE_ENGINE_DISTILLER_PROVIDER: "gemini",
      EXPERIENCE_ENGINE_DISTILLER_AUTH_MODE: "api_key",
      EXPERIENCE_ENGINE_DISTILLER_MODEL: "gemini-2.5-flash"
    });

    expect(resolved.diagnostics.configured).toBe(false);
    expect(resolved.diagnostics.missingEnv).toContain("GEMINI_API_KEY");
  });

  it("does not require GEMINI_API_KEY for google_adc auth mode when adc is unavailable", () => {
    const resolved = geminiDistillerProvider.resolve({
      EXPERIENCE_ENGINE_DISTILLER_PROVIDER: "gemini",
      EXPERIENCE_ENGINE_DISTILLER_AUTH_MODE: "google_adc",
      EXPERIENCE_ENGINE_DISTILLER_MODEL: "gemini-2.5-flash"
    });

    expect(resolved.diagnostics.configured).toBe(false);
    expect(resolved.diagnostics.missingEnv).not.toContain("GEMINI_API_KEY");
    expect(resolved.endpoint).toBeNull();
  });

  it("resolves a gemini endpoint when google_adc credentials are available", () => {
    const dir = mkdtempSync(join(tmpdir(), "experienceengine-gemini-adc-"));
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

    const resolved = geminiDistillerProvider.resolve({
      EXPERIENCE_ENGINE_DISTILLER_PROVIDER: "gemini",
      EXPERIENCE_ENGINE_DISTILLER_AUTH_MODE: "google_adc",
      EXPERIENCE_ENGINE_DISTILLER_MODEL: "gemini-2.5-flash",
      GOOGLE_APPLICATION_CREDENTIALS: adcPath
    });

    expect(resolved.diagnostics.configured).toBe(true);
    expect(resolved.endpoint).not.toBeNull();
    expect(resolved.endpoint?.kind).toBe("gemini");
    if (resolved.endpoint?.kind === "gemini") {
      expect(resolved.endpoint.authMode).toBe("google_adc");
    }
  });
});
