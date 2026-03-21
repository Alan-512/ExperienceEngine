import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../src/config/load-config.js";
import { LlmDistiller } from "../../src/distillation/llm-distiller.js";
import { resolveDistillationResolution } from "../../src/distillation/host-llm.js";
import { DistillationQueueWorker } from "../../src/distillation/queue-worker.js";
import {
  clearEmbeddingProviderForTests,
  setEmbeddingProviderForTests
} from "../../src/store/vector/embeddings.js";
import { bootstrapDatabase, openDatabase } from "../../src/store/sqlite/db.js";
import { CandidateRepository } from "../../src/store/sqlite/repositories/candidate-repo.js";
import { DistillationJobRepository } from "../../src/store/sqlite/repositories/distillation-job-repo.js";
import { NodeRepository } from "../../src/store/sqlite/repositories/node-repo.js";
import type { DistillationJob, ExperienceCandidate } from "../../src/types/domain.js";

const tempDirs: string[] = [];

const makeDb = (overrides: Partial<ReturnType<typeof loadConfig>> = {}) => {
  const runtimeDir = mkdtempSync(join(tmpdir(), "experienceengine-distillation-"));
  tempDirs.push(runtimeDir);
  const config = loadConfig({
    dataDir: runtimeDir,
    sqlitePath: join(runtimeDir, "experienceengine.db"),
    captureDir: join(runtimeDir, "captures"),
    distillationAutoDrain: false,
    ...overrides
  }, { homeDir: runtimeDir });
  const db = openDatabase(config);
  bootstrapDatabase(db);
  return { db, config };
};

afterEach(() => {
  clearEmbeddingProviderForTests();
  while (tempDirs.length) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

const writeCodexConfig = (homeDir: string, payload: string): string => {
  const configPath = join(homeDir, ".codex", "config.toml");
  mkdirSync(join(homeDir, ".codex"), { recursive: true });
  writeFileSync(configPath, payload, "utf8");
  return configPath;
};

const makeCandidate = (overrides: Partial<ExperienceCandidate> = {}): ExperienceCandidate => ({
  id: "candidate_distill_auth",
  source_record_id: "input_auth",
  scope_id: "scope_1",
  task_type: "test_debug",
  node_type: "strategy",
  trigger_pattern: "Fix the failing auth vitest",
  compact_hint: "Use vitest as the terminal verification loop for the auth failure.",
  goal: "Keep the auth test in a narrow loop.",
  success_signal: "vitest passes",
  evidence_summary: "Terminal sequence: vitest passed.",
  retrieval_text: "Fix the failing auth vitest\nvitest passed",
  source_kind: "system_derived",
  source_outcome_signal: "success",
  source_context_summary: "Auth test failure in the current repo.",
  source_signal: {
    task_summary: "Fix the failing auth vitest",
    context_summary: "Auth test failure in the current repo.",
    outcome_signal: "success",
    tool_events: [],
    evidence: ["vitest: success: Auth spec now passes."],
    failure_signature: "Auth spec assertion failure",
    retry_count: 1,
    correction_signals: ["apply_patch"],
    tool_event_summary: ["failure: vitest failed: Auth spec assertion failure", "success: vitest succeeded"]
  },
  lifecycle_state: "pending",
  retry_count: 0,
  created_at: "2026-03-15T10:00:00.000Z",
  updated_at: "2026-03-15T10:00:00.000Z",
  ...overrides
});

const makeJob = (overrides: Partial<DistillationJob> = {}): DistillationJob => ({
  id: "job_distill_auth",
  candidate_id: "candidate_distill_auth",
  status: "pending",
  extractor_profile: "balanced",
  retry_count: 0,
  created_at: "2026-03-15T10:00:00.000Z",
  updated_at: "2026-03-15T10:00:00.000Z",
  ...overrides
});

describe("LlmDistiller", () => {
  it("defaults distillation mode to auto", () => {
    const { config } = makeDb();

    expect(config.distillationMode).toBe("auto");
  });

  it("supports rule mode without a configured llm endpoint", async () => {
    const { config } = makeDb({ distillationMode: "rule" });
    const distiller = new LlmDistiller(config, { env: {} });
    const result = await distiller.distill(makeCandidate());

    expect(result.compact_hint).toBe("Use vitest as the terminal verification loop for the auth failure.");
  });

  it("uses rule mode by default when auto mode has no explicit provider configured", async () => {
    const { config } = makeDb({ distillationMode: "auto" });
    const distiller = new LlmDistiller(config, { env: {} });
    const result = await distiller.distill(makeCandidate());

    expect(result.compact_hint).toBe("Use vitest as the terminal verification loop for the auth failure.");
  });

  it("rejects distillation when llm mode is forced and no endpoint is configured", async () => {
    const { config } = makeDb({ distillationMode: "llm" });
    const distiller = new LlmDistiller(config, { env: {} });

    await expect(distiller.distill(makeCandidate())).rejects.toThrow("configured LLM endpoint");
  });

  it("does not treat auth-only Codex config as a usable llm distiller", () => {
    const homeDir = mkdtempSync(join(tmpdir(), "experienceengine-codex-config-"));
    tempDirs.push(homeDir);
    writeCodexConfig(
      homeDir,
      `model = "gpt-5.4"
`
    );

    const resolution = resolveDistillationResolution({
      env: {
        EXPERIENCE_ENGINE_ADAPTER: "codex"
      },
      distillationMode: "llm",
      allowRuleFallback: false
    });

    expect(resolution.distillationMode).toBe("disabled");
    expect(resolution.distillationSource).toBe("disabled");
    expect(resolution.reason).toContain("explicit");
  });

  it("resolves legacy explicit env as the openai_compatible provider", () => {
    const resolution = resolveDistillationResolution({
      env: {
        EXPERIENCE_ENGINE_DISTILLER_MODEL: "gpt-test",
        EXPERIENCE_ENGINE_DISTILLER_API_KEY: "secret"
      },
      distillationMode: "llm",
      allowRuleFallback: false
    });

    expect(resolution.distillationMode).toBe("llm");
    expect(resolution.distillationSource).toBe("explicit_provider");
    expect(resolution.provider).toBe("openai_compatible");
    expect(resolution.diagnostics.configured).toBe(true);
  });

  it("resolves explicit openai provider env separately from generic compatible mode", () => {
    const resolution = resolveDistillationResolution({
      env: {
        EXPERIENCE_ENGINE_DISTILLER_PROVIDER: "openai",
        EXPERIENCE_ENGINE_DISTILLER_MODEL: "gpt-5.4",
        OPENAI_API_KEY: "secret"
      },
      distillationMode: "llm",
      allowRuleFallback: false
    });

    expect(resolution.distillationMode).toBe("llm");
    expect(resolution.distillationSource).toBe("explicit_provider");
    expect(resolution.provider).toBe("openai");
    expect(resolution.diagnostics.model).toBe("gpt-5.4");
  });

  it("falls back to passthrough distillation when no remote profile is configured", async () => {
    const { config } = makeDb({ distillationAllowPassthrough: true });
    const distiller = new LlmDistiller(config, { env: {} });
    const result = await distiller.distill(makeCandidate());

    expect(result.compact_hint).toBe("Use vitest as the terminal verification loop for the auth failure.");
    expect(result.goal).toBe("Keep the auth test in a narrow loop.");
  });

  it("rejects distillation when no endpoint is configured and passthrough is disabled", async () => {
    const { config } = makeDb({ distillationAllowPassthrough: false });
    const distiller = new LlmDistiller(config, { env: {} });

    await expect(distiller.distill(makeCandidate())).rejects.toThrow("configured LLM endpoint");
  });

  it("parses structured remote distillation output when a provider is configured", async () => {
    const { config } = makeDb();
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                compact_hint: "Re-run vitest before each auth fix and after the smallest code change.",
                trigger_conditions: "When iterating on auth test fixes",
                success_criteria: "vitest passes for the auth spec",
                risk_level: "medium",
                goal: "Preserve a tight auth verification loop.",
                recommended_steps: ["Run vitest", "Change one auth seam", "Run vitest again"],
                evidence_summary: "Distilled from a vitest pass."
              })
            }
          }
        ]
      })
    });

    const distiller = new LlmDistiller(config, {
      env: {
        EXPERIENCE_ENGINE_DISTILLER_MODEL: "gpt-test",
        EXPERIENCE_ENGINE_DISTILLER_API_KEY: "secret",
        EXPERIENCE_ENGINE_DISTILLER_BASE_URL: "https://example.test/v1/chat/completions"
      },
      fetchImpl: fetchImpl as unknown as typeof fetch
    });

    const result = await distiller.distill(makeCandidate());

    expect(fetchImpl).toHaveBeenCalledOnce();
    const requestBody = JSON.parse((fetchImpl.mock.calls[0]?.[1] as { body: string }).body);
    const payload = JSON.parse(requestBody.messages[1].content);
    expect(payload.sourceSignal.tool_event_summary).toBeDefined();
    expect(result.compact_hint).toContain("Re-run vitest");
    expect(result.recommended_steps).toEqual(["Run vitest", "Change one auth seam", "Run vitest again"]);
  });

  it("uses the native openai provider path when openai is configured", async () => {
    const { config } = makeDb({
      distillerProvider: "openai"
    });
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                compact_hint: "Use the targeted auth verification loop before and after each minimal edit.",
                trigger_conditions: "When iterating on auth test fixes",
                success_criteria: "the targeted auth verification passes",
                risk_level: "low"
              })
            }
          }
        ]
      })
    });

    const distiller = new LlmDistiller(config, {
      env: {
        EXPERIENCE_ENGINE_DISTILLER_PROVIDER: "openai",
        EXPERIENCE_ENGINE_DISTILLER_MODEL: "gpt-5.4",
        OPENAI_API_KEY: "openai-secret",
        EXPERIENCE_ENGINE_DISTILLER_API_KEY: "wrong-secret"
      },
      fetchImpl: fetchImpl as unknown as typeof fetch
    });

    const result = await distiller.distill(makeCandidate());

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, requestInit] = fetchImpl.mock.calls[0] as [string, { headers: Record<string, string>; body: string }];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect(requestInit.headers.Authorization).toBe("Bearer openai-secret");
    const requestBody = JSON.parse(requestInit.body);
    expect(requestBody.model).toBe("gpt-5.4");
    expect(result.compact_hint).toContain("targeted auth verification loop");
  });

  it("uses the selected provider resolution when openrouter is configured", async () => {
    const { config } = makeDb({
      distillerProvider: "openrouter"
    });
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                compact_hint: "Keep the auth fix loop narrow and rerun the targeted check after each edit.",
                trigger_conditions: "When iterating on auth test fixes",
                success_criteria: "the targeted auth check passes",
                risk_level: "low"
              })
            }
          }
        ]
      })
    });

    const distiller = new LlmDistiller(config, {
      env: {
        EXPERIENCE_ENGINE_DISTILLER_PROVIDER: "openrouter",
        EXPERIENCE_ENGINE_DISTILLER_MODEL: "openai/gpt-4o-mini",
        OPENROUTER_API_KEY: "secret"
      },
      fetchImpl: fetchImpl as unknown as typeof fetch
    });

    const result = await distiller.distill(makeCandidate());

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, requestInit] = fetchImpl.mock.calls[0] as [string, { headers: Record<string, string>; body: string }];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(requestInit.headers.Authorization).toBe("Bearer secret");
    expect(result.compact_hint).toContain("Keep the auth fix loop narrow");
  });

  it("uses the native anthropic messages api when anthropic is configured", async () => {
    const { config } = makeDb({
      distillerProvider: "anthropic"
    });
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              compact_hint: "Keep the auth fix loop narrow and verify after every minimal change.",
              trigger_conditions: "When iterating on auth test fixes",
              success_criteria: "the targeted auth verification passes",
              risk_level: "low"
            })
          }
        ]
      })
    });

    const distiller = new LlmDistiller(config, {
      env: {
        EXPERIENCE_ENGINE_DISTILLER_PROVIDER: "anthropic",
        EXPERIENCE_ENGINE_DISTILLER_MODEL: "claude-sonnet-4-20250514",
        ANTHROPIC_API_KEY: "anthropic-secret"
      },
      fetchImpl: fetchImpl as unknown as typeof fetch
    });

    const result = await distiller.distill(makeCandidate());

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, requestInit] = fetchImpl.mock.calls[0] as [string, { headers: Record<string, string>; body: string }];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(requestInit.headers["x-api-key"]).toBe("anthropic-secret");
    expect(requestInit.headers["anthropic-version"]).toBe("2023-06-01");
    const requestBody = JSON.parse(requestInit.body);
    expect(requestBody.model).toBe("claude-sonnet-4-20250514");
    expect(requestBody.max_tokens).toBe(1024);
    expect(requestBody.system).toContain("coding-task experience candidates");
    expect(requestBody.messages[0].role).toBe("user");
    expect(result.compact_hint).toContain("Keep the auth fix loop narrow");
  });

  it("uses the native gemini generateContent api when gemini is configured", async () => {
    const { config } = makeDb({
      distillerProvider: "gemini"
    });
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    compact_hint: "Keep the auth change small and re-run the target check after each edit.",
                    trigger_conditions: "When iterating on auth test fixes",
                    success_criteria: "the targeted auth verification passes",
                    risk_level: "low"
                  })
                }
              ]
            }
          }
        ]
      })
    });

    const distiller = new LlmDistiller(config, {
      env: {
        EXPERIENCE_ENGINE_DISTILLER_PROVIDER: "gemini",
        EXPERIENCE_ENGINE_DISTILLER_MODEL: "gemini-2.5-flash",
        GEMINI_API_KEY: "gemini-secret"
      },
      fetchImpl: fetchImpl as unknown as typeof fetch
    });

    const result = await distiller.distill(makeCandidate());

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, requestInit] = fetchImpl.mock.calls[0] as [string, { body: string }];
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=gemini-secret"
    );
    const requestBody = JSON.parse(requestInit.body);
    expect(requestBody.system_instruction.parts[0].text).toContain("coding-task experience candidates");
    expect(requestBody.contents[0].role).toBe("user");
    expect(result.compact_hint).toContain("Keep the auth change small");
  });

  it("uses the native azure openai path when azure_openai is configured", async () => {
    const { config } = makeDb({
      distillerProvider: "azure_openai"
    });
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                compact_hint: "Verify the auth fix against the deployed target loop after each minimal edit.",
                trigger_conditions: "When iterating on auth test fixes",
                success_criteria: "the targeted auth verification passes",
                risk_level: "low"
              })
            }
          }
        ]
      })
    });

    const distiller = new LlmDistiller(config, {
      env: {
        EXPERIENCE_ENGINE_DISTILLER_PROVIDER: "azure_openai",
        EXPERIENCE_ENGINE_DISTILLER_MODEL: "gpt-4.1-mini-deployment",
        AZURE_OPENAI_ENDPOINT: "https://example-resource.openai.azure.com",
        AZURE_OPENAI_API_KEY: "azure-secret",
        AZURE_OPENAI_API_VERSION: "2024-10-21"
      },
      fetchImpl: fetchImpl as unknown as typeof fetch
    });

    const result = await distiller.distill(makeCandidate());

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, requestInit] = fetchImpl.mock.calls[0] as [string, { headers: Record<string, string>; body: string }];
    expect(url).toBe(
      "https://example-resource.openai.azure.com/openai/deployments/gpt-4.1-mini-deployment/chat/completions?api-version=2024-10-21"
    );
    expect(requestInit.headers["api-key"]).toBe("azure-secret");
    const requestBody = JSON.parse(requestInit.body);
    expect(requestBody.model).toBe("gpt-4.1-mini-deployment");
    expect(result.compact_hint).toContain("Verify the auth fix");
  });

  it("uses the native bedrock converse api when bedrock is configured", async () => {
    const { config } = makeDb({
      distillerProvider: "bedrock"
    });
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output: {
          message: {
            content: [
              {
                text: JSON.stringify({
                  compact_hint: "Keep the auth loop tight and verify after each minimal edit.",
                  trigger_conditions: "When iterating on auth test fixes",
                  success_criteria: "the targeted auth verification passes",
                  risk_level: "low"
                })
              }
            ]
          }
        }
      })
    });

    const distiller = new LlmDistiller(config, {
      env: {
        EXPERIENCE_ENGINE_DISTILLER_PROVIDER: "bedrock",
        EXPERIENCE_ENGINE_DISTILLER_MODEL: "anthropic.claude-3-5-sonnet-20240620-v1:0",
        AWS_ACCESS_KEY_ID: "AKIDEXAMPLE",
        AWS_SECRET_ACCESS_KEY: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
        AWS_REGION: "us-east-1"
      },
      fetchImpl: fetchImpl as unknown as typeof fetch
    });

    const result = await distiller.distill(makeCandidate());

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, requestInit] = fetchImpl.mock.calls[0] as [string, { headers: Record<string, string>; body: string }];
    expect(url).toBe(
      "https://bedrock-runtime.us-east-1.amazonaws.com/model/anthropic.claude-3-5-sonnet-20240620-v1%3A0/converse"
    );
    expect(requestInit.headers.Authorization).toContain("AWS4-HMAC-SHA256");
    expect(requestInit.headers["x-amz-date"]).toBeDefined();
    const requestBody = JSON.parse(requestInit.body);
    expect(requestBody.inferenceConfig.maxTokens).toBe(1024);
    expect(requestBody.system[0].text).toContain("coding-task experience candidates");
    expect(result.compact_hint).toContain("Keep the auth loop tight");
  });

  it("rejects distillation output missing required OPD fields", async () => {
    const { config } = makeDb();
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                compact_hint: "Re-run vitest after each change."
              })
            }
          }
        ]
      })
    });

    const distiller = new LlmDistiller(config, {
      env: {
        EXPERIENCE_ENGINE_DISTILLER_MODEL: "gpt-test",
        EXPERIENCE_ENGINE_DISTILLER_API_KEY: "secret",
        EXPERIENCE_ENGINE_DISTILLER_BASE_URL: "https://example.test/v1/chat/completions"
      },
      fetchImpl: fetchImpl as unknown as typeof fetch
    });

    await expect(distiller.distill(makeCandidate())).rejects.toThrow("missing required fields");
  });

  it("falls back to rule distillation when a transient provider error occurs and passthrough is enabled", async () => {
    const { config } = makeDb({
      distillationAllowPassthrough: true,
      distillerProvider: "openrouter",
      distillerModel: "openrouter/free"
    });
    const distiller = new LlmDistiller(config, {
      env: {
        EXPERIENCE_ENGINE_DISTILLER_PROVIDER: "openrouter",
        EXPERIENCE_ENGINE_DISTILLER_MODEL: "openrouter/free",
        OPENROUTER_API_KEY: "secret"
      },
      fetchImpl: vi.fn().mockResolvedValue({
        ok: false,
        status: 429
      }) as unknown as typeof fetch
    });

    const result = await distiller.distill(makeCandidate());

    expect(result.distillation_mode_used).toBe("rule");
    expect(result.distillation_source).toBe("rule");
    expect(result.compact_hint).toBe("Use vitest as the terminal verification loop for the auth failure.");
  });

  it("falls back to rule distillation when remote requests time out and passthrough is enabled", async () => {
    const { config } = makeDb({
      distillationAllowPassthrough: true
    });
    const fetchImpl = vi.fn().mockRejectedValue(Object.assign(new Error("aborted"), { name: "AbortError" }));

    const distiller = new LlmDistiller(config, {
      env: {
        EXPERIENCE_ENGINE_DISTILLER_MODEL: "gpt-test",
        EXPERIENCE_ENGINE_DISTILLER_API_KEY: "secret",
        EXPERIENCE_ENGINE_DISTILLER_BASE_URL: "https://example.test/v1/chat/completions"
      },
      fetchImpl: fetchImpl as unknown as typeof fetch
    });

    const result = await distiller.distill(makeCandidate());

    expect(result.distillation_mode_used).toBe("rule");
    expect(result.distillation_source).toBe("rule");
    expect(result.compact_hint).toBe("Use vitest as the terminal verification loop for the auth failure.");
  });

  it("uses a longer internal timeout window for free distillation models before falling back to rule mode", async () => {
    const { config } = makeDb({
      distillerProvider: "openrouter",
      distillerModel: "openrouter/free",
      distillationAllowPassthrough: true
    });
    const fetchImpl = vi.fn().mockRejectedValue(Object.assign(new Error("aborted"), { name: "AbortError" }));

    const distiller = new LlmDistiller(config, {
      env: {
        OPENROUTER_API_KEY: "secret"
      },
      fetchImpl: fetchImpl as unknown as typeof fetch
    });

    const result = await distiller.distill(makeCandidate());

    expect(result.distillation_mode_used).toBe("rule");
    expect(result.distillation_source).toBe("rule");
    expect(result.compact_hint).toBe("Use vitest as the terminal verification loop for the auth failure.");
  });
});

describe("DistillationQueueWorker", () => {
  it("promotes pending candidates into formal nodes", async () => {
    setEmbeddingProviderForTests({
      provider: "local",
      model: "Xenova/multilingual-e5-small",
      version: "local-e5-v1",
      dimensions: 3,
      async embedQuery() {
        return [1, 0, 0];
      },
      async embedPassage() {
        return [1, 0, 0];
      }
    });

    const { db, config } = makeDb({ distillationAllowPassthrough: true });
    const candidateRepo = new CandidateRepository(db);
    const jobRepo = new DistillationJobRepository(db);
    const nodeRepo = new NodeRepository(db);
    candidateRepo.upsert(makeCandidate());
    jobRepo.upsert(makeJob());

    const worker = new DistillationQueueWorker(config, candidateRepo, jobRepo, nodeRepo, { env: {} });
    const drained = await worker.drain();

    expect(drained).toBe(1);
    expect(candidateRepo.getById("candidate_distill_auth")?.lifecycle_state).toBe("distilled");
    expect(jobRepo.getById("job_distill_auth")?.status).toBe("succeeded");
    const [createdNode] = nodeRepo.listByState("candidate");
    expect(createdNode).toBeDefined();
    expect(createdNode?.embedding_provider).toBe("local");
    expect(createdNode?.embedding_model).toBe("Xenova/multilingual-e5-small");
    expect(createdNode?.embedding_version).toBe("local-e5-v1");
    expect(createdNode?.embedding_dimensions).toBe(3);
    expect(createdNode?.embedding).toEqual([1, 0, 0]);
    expect(createdNode?.distillation_mode_used).toBe("rule");
    expect(createdNode?.distillation_source).toBe("rule");
    expect(jobRepo.getById("job_distill_auth")?.distillation_source).toBe("rule");
  });

  it("discards candidates after retry exhaustion", async () => {
    const { db, config } = makeDb();
    const candidateRepo = new CandidateRepository(db);
    const jobRepo = new DistillationJobRepository(db);
    const nodeRepo = new NodeRepository(db);
    candidateRepo.upsert(makeCandidate());
    jobRepo.upsert(makeJob());

    const worker = new DistillationQueueWorker(
      {
        ...config,
        distillationMaxRetries: 0
      },
      candidateRepo,
      jobRepo,
      nodeRepo,
      {
        env: {
          EXPERIENCE_ENGINE_DISTILLER_MODEL: "gpt-test",
          EXPERIENCE_ENGINE_DISTILLER_API_KEY: "secret",
          EXPERIENCE_ENGINE_DISTILLER_BASE_URL: "https://example.test/v1/chat/completions"
        },
        fetchImpl: vi.fn().mockResolvedValue({ ok: false, status: 400 }) as unknown as typeof fetch
      }
    );

    await worker.drain();

    expect(candidateRepo.getById("candidate_distill_auth")?.lifecycle_state).toBe("discarded");
    expect(jobRepo.getById("job_distill_auth")?.status).toBe("discarded");
    expect(nodeRepo.listAll()).toHaveLength(0);
  });

  it("treats invalid distillation output as a retryable failure", async () => {
    const { db, config } = makeDb();
    const candidateRepo = new CandidateRepository(db);
    const jobRepo = new DistillationJobRepository(db);
    const nodeRepo = new NodeRepository(db);
    candidateRepo.upsert(makeCandidate());
    jobRepo.upsert(makeJob());

    const worker = new DistillationQueueWorker(
      {
        ...config,
        distillationMaxRetries: 0
      },
      candidateRepo,
      jobRepo,
      nodeRepo,
      {
        env: {
          EXPERIENCE_ENGINE_DISTILLER_MODEL: "gpt-test",
          EXPERIENCE_ENGINE_DISTILLER_API_KEY: "secret",
          EXPERIENCE_ENGINE_DISTILLER_BASE_URL: "https://example.test/v1/chat/completions"
        },
        fetchImpl: vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    compact_hint: "Re-run vitest after each change."
                  })
                }
              }
            ]
          })
        }) as unknown as typeof fetch
      }
    );

    await worker.drain();

    expect(candidateRepo.getById("candidate_distill_auth")?.lifecycle_state).toBe("discarded");
    expect(jobRepo.getById("job_distill_auth")?.status).toBe("discarded");
  });

  it("records a stable failure bucket when llm mode is forced without an explicit provider", async () => {
    const { db, config } = makeDb({
      distillationMode: "llm",
      distillationAllowPassthrough: false
    });
    const candidateRepo = new CandidateRepository(db);
    const jobRepo = new DistillationJobRepository(db);
    const nodeRepo = new NodeRepository(db);
    candidateRepo.upsert(makeCandidate({ id: "candidate_mediated_invalid", source_record_id: "input_mediated_invalid" }));
    jobRepo.upsert(makeJob({ id: "job_mediated_invalid", candidate_id: "candidate_mediated_invalid" }));

    const worker = new DistillationQueueWorker(config, candidateRepo, jobRepo, nodeRepo, {
      env: {}
    });

    await worker.drain();

    expect(jobRepo.getById("job_mediated_invalid")?.status).toBe("failed");
    expect(jobRepo.getById("job_mediated_invalid")?.failure_bucket).toBe("distillation_failed");
  });

  it("requeues stale processing jobs instead of leaving them stuck forever", async () => {
    setEmbeddingProviderForTests({
      provider: "local",
      model: "Xenova/multilingual-e5-small",
      version: "local-e5-v1",
      dimensions: 3,
      async embedQuery() {
        return [1, 0, 0];
      },
      async embedPassage() {
        return [1, 0, 0];
      }
    });

    const { db, config } = makeDb({ distillationAllowPassthrough: true });
    const candidateRepo = new CandidateRepository(db);
    const jobRepo = new DistillationJobRepository(db);
    const nodeRepo = new NodeRepository(db);
    candidateRepo.upsert(makeCandidate({ updated_at: "2026-03-15T10:00:00.000Z" }));
    jobRepo.upsert(
      makeJob({
        status: "processing",
        started_at: "2026-03-15T10:00:00.000Z",
        updated_at: "2026-03-15T10:00:00.000Z"
      })
    );

    const worker = new DistillationQueueWorker(config, candidateRepo, jobRepo, nodeRepo, { env: {} });
    const drained = await worker.drain();

    expect(drained).toBe(1);
    expect(candidateRepo.getById("candidate_distill_auth")?.lifecycle_state).toBe("distilled");
    expect(candidateRepo.getById("candidate_distill_auth")?.retry_count).toBe(1);
    expect(jobRepo.getById("job_distill_auth")?.status).toBe("succeeded");
    expect(jobRepo.getById("job_distill_auth")?.retry_count).toBe(1);
    expect(nodeRepo.listByState("candidate")).toHaveLength(1);
  });

  it("does not recover processing jobs before the longer stale lease expires", async () => {
    const now = new Date();
    const ninetySecondsAgo = new Date(now.getTime() - 90_000).toISOString();
    const { db, config } = makeDb({ distillationAllowPassthrough: true });
    const candidateRepo = new CandidateRepository(db);
    const jobRepo = new DistillationJobRepository(db);
    const nodeRepo = new NodeRepository(db);
    candidateRepo.upsert(makeCandidate({ updated_at: ninetySecondsAgo }));
    jobRepo.upsert(
      makeJob({
        status: "processing",
        started_at: ninetySecondsAgo,
        updated_at: ninetySecondsAgo
      })
    );

    const worker = new DistillationQueueWorker(config, candidateRepo, jobRepo, nodeRepo, { env: {} });
    const drained = await worker.drain();

    expect(drained).toBe(0);
    expect(candidateRepo.getById("candidate_distill_auth")?.lifecycle_state).toBe("pending");
    expect(jobRepo.getById("job_distill_auth")?.status).toBe("processing");
  });

  it("falls back to legacy embedding metadata when the local provider fails", async () => {
    setEmbeddingProviderForTests({
      provider: "local",
      model: "Xenova/multilingual-e5-small",
      version: "local-e5-v1",
      dimensions: 3,
      async embedQuery() {
        return [1, 0, 0];
      },
      async embedPassage() {
        throw new Error("model unavailable");
      }
    });

    const { db, config } = makeDb({ distillationAllowPassthrough: true });
    const candidateRepo = new CandidateRepository(db);
    const jobRepo = new DistillationJobRepository(db);
    const nodeRepo = new NodeRepository(db);
    candidateRepo.upsert(makeCandidate());
    jobRepo.upsert(makeJob());

    const worker = new DistillationQueueWorker(config, candidateRepo, jobRepo, nodeRepo, { env: {} });
    await worker.drain();

    const [createdNode] = nodeRepo.listByState("candidate");
    expect(createdNode).toBeDefined();
    expect(createdNode?.embedding_provider).toBe("legacy");
    expect(createdNode?.embedding_model).toBe("hashed-bow");
    expect(createdNode?.embedding_version).toBeTruthy();
    expect(createdNode?.embedding_dimensions).toBe(createdNode?.embedding?.length);
  });

  it("reuses an existing node when the distilled trigger matches exactly", async () => {
    setEmbeddingProviderForTests({
      provider: "local",
      model: "Xenova/multilingual-e5-small",
      version: "local-e5-v1",
      dimensions: 3,
      async embedQuery() {
        return [1, 0, 0];
      },
      async embedPassage() {
        return [1, 0, 0];
      }
    });

    const { db, config } = makeDb();
    const candidateRepo = new CandidateRepository(db);
    const jobRepo = new DistillationJobRepository(db);
    const nodeRepo = new NodeRepository(db);

    candidateRepo.upsert(
      makeCandidate({
        task_type: "build_debug",
        trigger_pattern:
          "This is a build debugging verification task. In the current workspace, run pwd and pnpm typecheck. Fix the build issue and report whether the typecheck command passed.",
        compact_hint: "Focus on resolving the first typecheck failure by restoring the missing symbol before proceeding with further changes."
      })
    );
    jobRepo.upsert(makeJob());
    nodeRepo.upsert({
      id: "node_existing_build",
      node_type: "strategy",
      scope_id: "scope_1",
      task_type: "build_debug",
      trigger_pattern:
        "This is a build debugging verification task. In the current workspace, run pwd and pnpm typecheck. Fix the build issue and report whether the typecheck command passed.",
      compact_hint: "Focus on resolving the first typecheck failure by restoring the missing symbol before proceeding with further changes.",
      goal: "Clear the first build blocker.",
      recommended_steps: [],
      avoid_steps: [],
      fallback_steps: [],
      success_signal: "typecheck passes",
      evidence_summary: "Previous build-debug validation succeeded.",
      retrieval_text:
        "This is a build debugging verification task. In the current workspace, run pwd and pnpm typecheck. Fix the build issue and report whether the typecheck command passed.\nFocus on resolving the first typecheck failure by restoring the missing symbol before proceeding with further changes.",
      source_kind: "system_derived",
      distillation_mode_used: "llm",
      distillation_source: "explicit_provider",
      redistilled_from: undefined,
      origin_record_ids: ["input_old"],
      helped_record_ids: ["input_old"],
      harmed_record_ids: [],
      state: "active",
      usage_count: 1,
      helped_count: 1,
      harmed_count: 0,
      support_count: 1,
      created_at: "2026-03-20T11:00:00.000Z",
      updated_at: "2026-03-20T11:00:00.000Z"
    });

    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  compact_hint:
                    "Focus on resolving the first typecheck error before proceeding with further changes; this keeps the build loop narrow.",
                  trigger_conditions:
                    "This is a build debugging verification task. In the current workspace, run pwd and pnpm typecheck. Fix the build issue and report whether the typecheck command passed.",
                  success_criteria: "pnpm typecheck passes",
                  risk_level: "medium",
                  goal: "Clear the first build blocker.",
                  recommended_steps: ["Run typecheck", "Fix the first error", "Run typecheck again"],
                  evidence_summary: "Distilled from a successful build-debug repair."
                })
              }
            }
          ]
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  action: "UPDATE",
                  target_node_id: "node_existing_build",
                  reason: "The existing build node expresses the same lesson but benefits from the refined wording."
                })
              }
            }
          ]
        })
      });

    const worker = new DistillationQueueWorker(config, candidateRepo, jobRepo, nodeRepo, {
      env: {
        EXPERIENCE_ENGINE_DISTILLER_PROVIDER: "openrouter",
        EXPERIENCE_ENGINE_DISTILLER_MODEL: "openai/gpt-4o-mini",
        OPENROUTER_API_KEY: "secret"
      },
      fetchImpl: fetchImpl as unknown as typeof fetch
    });

    await worker.drain();

    const existingNode = nodeRepo.getById("node_existing_build");
    expect(existingNode).toBeDefined();
    expect(existingNode?.compact_hint).toContain("first typecheck error");
    expect(existingNode?.support_count).toBe(2);
    expect(existingNode?.state).toBe("active");
    expect(nodeRepo.listAll()).toHaveLength(1);
    expect(candidateRepo.getById("candidate_distill_auth")?.distilled_node_id).toBe("node_existing_build");
  });

  it("reuses an existing node when the distilled trigger is semantically near-duplicate", async () => {
    setEmbeddingProviderForTests({
      provider: "local",
      model: "Xenova/multilingual-e5-small",
      version: "local-e5-v1",
      dimensions: 3,
      async embedQuery() {
        return [1, 0, 0];
      },
      async embedPassage() {
        return [1, 0, 0];
      }
    });

    const { db, config } = makeDb();
    const candidateRepo = new CandidateRepository(db);
    const jobRepo = new DistillationJobRepository(db);
    const nodeRepo = new NodeRepository(db);

    candidateRepo.upsert(
      makeCandidate({
        task_type: "build_debug",
        trigger_pattern:
          "This is a build debugging verification task. In the current workspace, run pwd and pnpm typecheck. Fix the build issue and report whether the typecheck command passed.",
        compact_hint: "Focus on resolving the first typecheck failure by restoring the missing symbol before proceeding with further changes."
      })
    );
    jobRepo.upsert(makeJob());
    nodeRepo.upsert({
      id: "node_existing_build_near_dup",
      node_type: "strategy",
      scope_id: "scope_1",
      task_type: "build_debug",
      trigger_pattern:
        "In the current workspace, run pwd and pnpm typecheck, fix the first build issue you find, then report whether typecheck passes.",
      compact_hint: "Focus on resolving the first typecheck failure by restoring the missing symbol before proceeding with further changes.",
      goal: "Clear the first build blocker.",
      recommended_steps: [],
      avoid_steps: [],
      fallback_steps: [],
      success_signal: "typecheck passes",
      evidence_summary: "Previous build-debug validation succeeded.",
      retrieval_text:
        "In the current workspace, run pwd and pnpm typecheck, fix the first build issue you find, then report whether typecheck passes.\nFocus on resolving the first typecheck failure by restoring the missing symbol before proceeding with further changes.",
      source_kind: "system_derived",
      distillation_mode_used: "llm",
      distillation_source: "explicit_provider",
      redistilled_from: undefined,
      origin_record_ids: ["input_old"],
      helped_record_ids: ["input_old"],
      harmed_record_ids: [],
      state: "active",
      usage_count: 1,
      helped_count: 1,
      harmed_count: 0,
      support_count: 1,
      created_at: "2026-03-20T11:00:00.000Z",
      updated_at: "2026-03-20T11:00:00.000Z"
    });

    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  compact_hint:
                    "Focus on resolving the first typecheck error before proceeding with further changes; this keeps the build loop narrow.",
                  trigger_conditions:
                    "This is a build debugging verification task. In the current workspace, run pwd and pnpm typecheck. Fix the build issue and report whether the typecheck command passed.",
                  success_criteria: "pnpm typecheck passes",
                  risk_level: "medium",
                  goal: "Clear the first build blocker.",
                  recommended_steps: ["Run typecheck", "Fix the first error", "Run typecheck again"],
                  evidence_summary: "Distilled from a successful build-debug repair."
                })
              }
            }
          ]
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  action: "UPDATE",
                  target_node_id: "node_existing_build_near_dup",
                  reason: "The existing node is a semantic near-duplicate and should absorb the refined text."
                })
              }
            }
          ]
        })
      });

    const worker = new DistillationQueueWorker(config, candidateRepo, jobRepo, nodeRepo, {
      env: {
        EXPERIENCE_ENGINE_DISTILLER_PROVIDER: "openrouter",
        EXPERIENCE_ENGINE_DISTILLER_MODEL: "openai/gpt-4o-mini",
        OPENROUTER_API_KEY: "secret"
      },
      fetchImpl: fetchImpl as unknown as typeof fetch
    });

    await worker.drain();

    expect(nodeRepo.listAll()).toHaveLength(1);
    expect(candidateRepo.getById("candidate_distill_auth")?.distilled_node_id).toBe("node_existing_build_near_dup");
  });

  it("reuses the active build node when the trigger is reworded but the hint is still near-duplicate", async () => {
    setEmbeddingProviderForTests({
      provider: "local",
      model: "Xenova/multilingual-e5-small",
      version: "local-e5-v1",
      dimensions: 3,
      async embedQuery() {
        return [1, 0, 0];
      },
      async embedPassage() {
        return [1, 0, 0];
      }
    });

    const { db, config } = makeDb();
    const candidateRepo = new CandidateRepository(db);
    const jobRepo = new DistillationJobRepository(db);
    const nodeRepo = new NodeRepository(db);

    candidateRepo.upsert(
      makeCandidate({
        task_type: "build_debug",
        trigger_pattern:
          "Build verification pass: run pwd and pnpm typecheck, fix the first compile problem, then report whether typecheck passed.",
        compact_hint:
          "Focus on fixing the first compile error identified by pnpm typecheck before making further changes, then rerun pnpm typecheck to confirm the fix."
      })
    );
    jobRepo.upsert(makeJob());
    nodeRepo.upsert({
      id: "node_build_active",
      node_type: "strategy",
      scope_id: "scope_1",
      task_type: "build_debug",
      trigger_pattern:
        "This is a build debugging verification task. In the current workspace, run pwd and pnpm typecheck. Fix the build issue and report whether the typecheck command passed.",
      compact_hint: "Focus on resolving the first typecheck error with exec, then rerun exec to confirm the fix before proceeding.",
      goal: "Clear the first build blocker.",
      recommended_steps: [],
      avoid_steps: [],
      fallback_steps: [],
      success_signal: "typecheck passes",
      evidence_summary: "Previous build-debug validation succeeded.",
      retrieval_text:
        "This is a build debugging verification task. In the current workspace, run pwd and pnpm typecheck. Fix the build issue and report whether the typecheck command passed.\nFocus on resolving the first typecheck error with exec, then rerun exec to confirm the fix before proceeding.",
      source_kind: "system_derived",
      distillation_mode_used: "llm",
      distillation_source: "explicit_provider",
      redistilled_from: undefined,
      origin_record_ids: ["input_old"],
      helped_record_ids: ["input_old"],
      harmed_record_ids: [],
      state: "active",
      usage_count: 2,
      helped_count: 2,
      harmed_count: 0,
      support_count: 2,
      created_at: "2026-03-20T11:00:00.000Z",
      updated_at: "2026-03-20T11:00:00.000Z"
    });

    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  compact_hint:
                    "Focus on fixing the first compile error identified by pnpm typecheck before making further changes, then rerun pnpm typecheck to confirm the fix.",
                  trigger_conditions:
                    "Build verification pass: run pwd and pnpm typecheck, fix the first compile problem, then report whether typecheck passed.",
                  success_criteria: "pnpm typecheck passes",
                  risk_level: "medium",
                  goal: "Clear the first build blocker.",
                  recommended_steps: ["Run typecheck", "Fix the first error", "Run typecheck again"],
                  evidence_summary: "Distilled from a successful build-debug repair."
                })
              }
            }
          ]
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  action: "UPDATE",
                  target_node_id: "node_build_active",
                  reason: "The active build node matches the same lesson and should keep accumulating support."
                })
              }
            }
          ]
        })
      });

    const worker = new DistillationQueueWorker(config, candidateRepo, jobRepo, nodeRepo, {
      env: {
        EXPERIENCE_ENGINE_DISTILLER_PROVIDER: "openrouter",
        EXPERIENCE_ENGINE_DISTILLER_MODEL: "openai/gpt-4o-mini",
        OPENROUTER_API_KEY: "secret"
      },
      fetchImpl: fetchImpl as unknown as typeof fetch
    });

    await worker.drain();

    expect(nodeRepo.listAll()).toHaveLength(1);
    expect(candidateRepo.getById("candidate_distill_auth")?.distilled_node_id).toBe("node_build_active");
    expect(nodeRepo.getById("node_build_active")?.support_count).toBe(3);
  });

  it("keeps governance fields untouched when the merge decision is NONE", async () => {
    setEmbeddingProviderForTests({
      provider: "local",
      model: "Xenova/multilingual-e5-small",
      version: "local-e5-v1",
      dimensions: 3,
      async embedQuery() {
        return [1, 0, 0];
      },
      async embedPassage() {
        return [1, 0, 0];
      }
    });

    const { db, config } = makeDb();
    const candidateRepo = new CandidateRepository(db);
    const jobRepo = new DistillationJobRepository(db);
    const nodeRepo = new NodeRepository(db);

    candidateRepo.upsert(
      makeCandidate({
        task_type: "build_debug",
        trigger_pattern: "Run pnpm typecheck, fix the first compile breakage, and rerun pnpm typecheck.",
        compact_hint: "Fix the first compile breakage before widening the change surface."
      })
    );
    jobRepo.upsert(makeJob());
    nodeRepo.upsert({
      id: "node_existing_none",
      node_type: "strategy",
      scope_id: "scope_1",
      task_type: "build_debug",
      trigger_pattern: "Run pnpm typecheck, fix the first compile breakage, and rerun pnpm typecheck.",
      compact_hint: "Fix the first compile breakage before widening the change surface.",
      goal: "Clear the first build blocker.",
      recommended_steps: ["Run typecheck", "Fix the first error", "Run typecheck again"],
      avoid_steps: [],
      fallback_steps: [],
      success_signal: "typecheck passes",
      evidence_summary: "Previous build-debug validation succeeded.",
      retrieval_text:
        "Run pnpm typecheck, fix the first compile breakage, and rerun pnpm typecheck.\nFix the first compile breakage before widening the change surface.",
      source_kind: "system_derived",
      distillation_mode_used: "llm",
      distillation_source: "explicit_provider",
      redistilled_from: undefined,
      origin_record_ids: ["input_old"],
      helped_record_ids: ["input_old"],
      harmed_record_ids: [],
      state: "active",
      usage_count: 5,
      helped_count: 4,
      harmed_count: 1,
      support_count: 2,
      created_at: "2026-03-20T11:00:00.000Z",
      updated_at: "2026-03-20T11:00:00.000Z"
    });

    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  compact_hint: "Fix the first compile breakage before widening the change surface.",
                  trigger_conditions: "Run pnpm typecheck, fix the first compile breakage, and rerun pnpm typecheck.",
                  success_criteria: "pnpm typecheck passes",
                  risk_level: "low",
                  goal: "Clear the first build blocker.",
                  recommended_steps: ["Run typecheck", "Fix the first error", "Run typecheck again"],
                  evidence_summary: "Distilled from a repeated successful build-debug repair."
                })
              }
            }
          ]
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  action: "NONE",
                  target_node_id: "node_existing_none",
                  reason: "The existing node already fully covers the new experience."
                })
              }
            }
          ]
        })
      });

    const worker = new DistillationQueueWorker(config, candidateRepo, jobRepo, nodeRepo, {
      env: {
        EXPERIENCE_ENGINE_DISTILLER_PROVIDER: "openrouter",
        EXPERIENCE_ENGINE_DISTILLER_MODEL: "openai/gpt-4o-mini",
        OPENROUTER_API_KEY: "secret"
      },
      fetchImpl: fetchImpl as unknown as typeof fetch
    });

    await worker.drain();

    const node = nodeRepo.getById("node_existing_none");
    expect(nodeRepo.listAll()).toHaveLength(1);
    expect(candidateRepo.getById("candidate_distill_auth")?.distilled_node_id).toBe("node_existing_none");
    expect(node?.compact_hint).toBe("Fix the first compile breakage before widening the change surface.");
    expect(node?.helped_count).toBe(4);
    expect(node?.harmed_count).toBe(1);
    expect(node?.state).toBe("active");
    expect(node?.support_count).toBe(3);
  });
});
