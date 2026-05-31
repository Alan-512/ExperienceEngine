import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { LlmRequestDispatcher } from "../../src/distillation/llm-request-dispatcher.js";
import type { DistillerEndpoint } from "../../src/distillation/providers/types.js";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

const openAiEndpoint = (model: string, provider: DistillerEndpoint["provider"] = "openai"): DistillerEndpoint => ({
  kind: "openai",
  model,
  baseUrl: "https://api.example.test/v1/chat/completions",
  headers: { Authorization: `Bearer ${model}` },
  source: "explicit",
  provider
});

describe("LlmRequestDispatcher", () => {
  it("falls back to the next endpoint when the response status is configured as fallbackable", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { model?: string };
      calls.push(body.model ?? "");
      if (calls.length === 1) {
        return new Response("rate limited", { status: 429 });
      }
      return Response.json({
        choices: [{ message: { content: "{\"ok\":true}" } }]
      });
    }) as typeof fetch;

    const content = await LlmRequestDispatcher.execute([openAiEndpoint("primary"), openAiEndpoint("fallback")], {
      systemPrompt: "system",
      userPrompt: "user",
      responseJson: true,
      fetchImpl,
      fallbackCodes: [429],
      retryDelayMs: 0
    });

    expect(content).toBe("{\"ok\":true}");
    expect(calls).toEqual(["primary", "fallback"]);
  });

  it("does not fall back for an HTTP status outside the configured fallback codes", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { model?: string };
      calls.push(body.model ?? "");
      return new Response("rate limited", { status: 429 });
    }) as typeof fetch;

    await expect(
      LlmRequestDispatcher.execute([openAiEndpoint("primary"), openAiEndpoint("fallback")], {
        systemPrompt: "system",
        userPrompt: "user",
        responseJson: true,
        fetchImpl,
        fallbackCodes: [503],
        retryDelayMs: 0
      })
    ).rejects.toThrow("LLM request failed with HTTP 429");

    expect(calls).toEqual(["primary"]);
  });

  it("hydrates OpenRouter fallback models from the configured ExperienceEngine home secrets", async () => {
    const homeDir = mkdtempSync(join(tmpdir(), "experienceengine-dispatcher-home-"));
    tempDirs.push(homeDir);
    const eeHome = join(homeDir, ".experienceengine");
    mkdirSync(eeHome, { recursive: true });
    writeFileSync(
      join(eeHome, "secrets.json"),
      JSON.stringify({
        EXPERIENCE_ENGINE_FALLBACK_MODELS: "openai/gpt-4o-mini,deepseek/deepseek-chat"
      }),
      "utf8"
    );

    let requestBody: Record<string, unknown> | undefined;
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      return Response.json({
        choices: [{ message: { content: "{\"ok\":true}" } }]
      });
    }) as typeof fetch;

    await LlmRequestDispatcher.execute([openAiEndpoint("google/gemma-4-31b-it:free", "openrouter")], {
      systemPrompt: "system",
      userPrompt: "user",
      responseJson: true,
      fetchImpl,
      env: {
        EXPERIENCE_ENGINE_HOME: eeHome
      } as NodeJS.ProcessEnv,
      retryDelayMs: 0
    });

    expect(requestBody?.models).toEqual([
      "google/gemma-4-31b-it:free",
      "openai/gpt-4o-mini",
      "deepseek/deepseek-chat"
    ]);
  });
});
