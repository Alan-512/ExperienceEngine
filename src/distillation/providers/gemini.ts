import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { DistillerProviderAdapter, ProviderResolution } from "./types.js";

const resolveGoogleAdcPath = (env: NodeJS.ProcessEnv = process.env): string =>
  env.GOOGLE_APPLICATION_CREDENTIALS?.trim() || join(homedir(), ".config", "gcloud", "application_default_credentials.json");

const hasGoogleAdcCredentials = (env: NodeJS.ProcessEnv = process.env): boolean =>
  existsSync(resolveGoogleAdcPath(env));

export const geminiDistillerProvider: DistillerProviderAdapter = {
  provider: "gemini",
  resolve(env: NodeJS.ProcessEnv): ProviderResolution {
    const model = env.EXPERIENCE_ENGINE_DISTILLER_MODEL?.trim();
    const authMode = env.EXPERIENCE_ENGINE_DISTILLER_AUTH_MODE?.trim() || "api_key";
    const apiKey = env.GEMINI_API_KEY?.trim();
    const adcPath = resolveGoogleAdcPath(env);
    const hasAdc = hasGoogleAdcCredentials(env);
    const missingEnv: string[] = [];

    if (!model) {
      missingEnv.push("EXPERIENCE_ENGINE_DISTILLER_MODEL");
    }
    if (authMode === "api_key" && !apiKey) {
      missingEnv.push("GEMINI_API_KEY");
    }

    const baseUrl = model
      ? `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
      : "https://generativelanguage.googleapis.com/v1beta/models/<model>:generateContent";

    const authDiagnostics =
      authMode === "google_adc"
        ? hasAdc
          ? {
              status: "adc_found",
              message: `ADC credentials found at ${adcPath}. Token acquisition will be validated at runtime.`
            }
          : {
              status: "adc_missing",
              message: "Run: gcloud auth application-default login"
            }
        : undefined;

    return {
      provider: "gemini",
      diagnostics: {
        configured: authMode === "google_adc" ? hasAdc && missingEnv.length === 0 : missingEnv.length === 0,
        provider: "gemini",
        model: model || undefined,
        baseUrl,
        missingEnv,
        authMode,
        authDiagnostics
      },
      endpoint:
        authMode === "api_key"
          ? model && apiKey
            ? {
                kind: "gemini",
                model,
                baseUrl: `${baseUrl}?key=${encodeURIComponent(apiKey)}`,
                headers: {},
                source: "explicit",
                provider: "gemini",
                authMode: "api_key"
              }
            : null
          : model && hasAdc
            ? {
                kind: "gemini",
                model,
                baseUrl,
                headers: {},
                source: "explicit",
                provider: "gemini",
                authMode: "google_adc",
                adcPath
              }
            : null
    };
  }
};
