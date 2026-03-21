import { describe, expect, it, vi } from "vitest";
import { runModelsCommand } from "../../src/cli/commands/models.js";

const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

describe("models command", () => {
  it("lists models for a provider from the catalog", async () => {
    await runModelsCommand("list", "openrouter", undefined, {
      resolveModelCatalog: async () => ({
        provider: "openrouter",
        source: "static",
        models: [
          { id: "openai/gpt-5.4-mini", name: "GPT-5.4 Mini", summary: "Fast text model" },
          { id: "openai/gpt-5.4-nano", name: "GPT-5.4 Nano", summary: "Cheaper text model" }
        ]
      })
    });

    expect(consoleLogSpy.mock.calls).toEqual(
      expect.arrayContaining([
        ["Model catalog: openrouter (static)"],
        ["- openai/gpt-5.4-mini | GPT-5.4 Mini | Fast text model"],
        ["- openai/gpt-5.4-nano | GPT-5.4 Nano | Cheaper text model"]
      ])
    );
  });

  it("shows lightweight-model guidance when listing provider models", async () => {
    await runModelsCommand("list", "openrouter", "mini", {
      resolveModelCatalog: async () => ({
        provider: "openrouter",
        source: "static",
        models: [{ id: "openai/gpt-5.4-mini", name: "GPT-5.4 Mini", summary: "Fast text model" }]
      })
    });

    expect(consoleLogSpy).toHaveBeenCalledWith(
      "[ExperienceEngine] Distillation usually works best with lightweight text models that return structured JSON quickly."
    );
  });
});
