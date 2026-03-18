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
  });
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

  it("uses rule mode by default when auto mode has no reusable host llm path", async () => {
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

  it("resolves auth-only Codex config to mediated distillation", () => {
    const homeDir = mkdtempSync(join(tmpdir(), "experienceengine-codex-mediated-"));
    tempDirs.push(homeDir);
    writeCodexConfig(
      homeDir,
      `model = "gpt-5.4"
`
    );

    const resolution = resolveDistillationResolution({
      env: {
        EXPERIENCE_ENGINE_USE_HOST_LLM: "true",
        EXPERIENCE_ENGINE_ADAPTER: "codex"
      },
      homeDir,
      distillationMode: "llm",
      allowRuleFallback: false
    });

    expect(resolution.distillationMode).toBe("llm");
    expect(resolution.distillationSource).toBe("host_mediated");
    if (resolution.distillationMode === "llm") {
      expect(resolution.host?.mode).toBe("mediated");
    }
  });

  it("uses Codex mediated distillation for auth-only host configs", async () => {
    const homeDir = mkdtempSync(join(tmpdir(), "experienceengine-codex-mediated-"));
    tempDirs.push(homeDir);
    writeCodexConfig(
      homeDir,
      `model = "gpt-5.4"
`
    );
    const { config } = makeDb({ distillationMode: "llm" });

    const distiller = new LlmDistiller(config, {
      env: {
        EXPERIENCE_ENGINE_USE_HOST_LLM: "true",
        EXPERIENCE_ENGINE_ADAPTER: "codex"
      },
      homeDir,
      codexExecRunner(command) {
        const outputPathIndex = command.args.findIndex((value) => value === "--output-last-message");
        const outputPath = outputPathIndex >= 0 ? command.args[outputPathIndex + 1] : undefined;
        if (!outputPath) {
          throw new Error("missing output path");
        }
        writeFileSync(
          outputPath,
          JSON.stringify({
            compact_hint: "Run the smallest auth repro loop before every fix.",
            trigger_conditions: "When Codex is iterating on an auth failure",
            success_criteria: "The auth verification command passes",
            risk_level: "medium",
            recommended_steps: ["Run the auth repro", "Change one seam", "Run it again"],
            avoid_steps: ["Do not widen the repro loop too early"],
            fallback_steps: ["If the repro stays red, inspect the first auth assertion"],
            evidence_summary: "Derived from a Codex-mediated auth debug loop."
          }),
          "utf8"
        );
        return {
          stdout: "",
          stderr: "",
          exitCode: 0
        };
      }
    });

    const result = await distiller.distill(makeCandidate());

    expect(result.compact_hint).toContain("smallest auth repro loop");
    expect(result.distillation_mode_used).toBe("llm");
    expect(result.distillation_source).toBe("host_mediated");
  });

  it("rejects mediated Codex output that is not strict JSON", async () => {
    const homeDir = mkdtempSync(join(tmpdir(), "experienceengine-codex-mediated-"));
    tempDirs.push(homeDir);
    writeCodexConfig(
      homeDir,
      `model = "gpt-5.4"
`
    );
    const { config } = makeDb({ distillationMode: "llm" });

    const distiller = new LlmDistiller(config, {
      env: {
        EXPERIENCE_ENGINE_USE_HOST_LLM: "true",
        EXPERIENCE_ENGINE_ADAPTER: "codex"
      },
      homeDir,
      codexExecRunner(command) {
        const outputPathIndex = command.args.findIndex((value) => value === "--output-last-message");
        const outputPath = outputPathIndex >= 0 ? command.args[outputPathIndex + 1] : undefined;
        if (!outputPath) {
          throw new Error("missing output path");
        }
        writeFileSync(outputPath, "Not JSON at all", "utf8");
        return {
          stdout: "",
          stderr: "",
          exitCode: 0
        };
      }
    });

    await expect(distiller.distill(makeCandidate())).rejects.toThrow("strict JSON");
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

  it("times out stalled remote distillation requests", async () => {
    const { config } = makeDb();
    const fetchImpl = vi.fn().mockRejectedValue(Object.assign(new Error("aborted"), { name: "AbortError" }));

    const distiller = new LlmDistiller(config, {
      env: {
        EXPERIENCE_ENGINE_DISTILLER_MODEL: "gpt-test",
        EXPERIENCE_ENGINE_DISTILLER_API_KEY: "secret",
        EXPERIENCE_ENGINE_DISTILLER_BASE_URL: "https://example.test/v1/chat/completions"
      },
      fetchImpl: fetchImpl as unknown as typeof fetch
    });

    await expect(distiller.distill(makeCandidate())).rejects.toThrow("timed out");
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
        fetchImpl: vi.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch
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

  it("records mediated invalid json failures with a stable failure bucket", async () => {
    const homeDir = mkdtempSync(join(tmpdir(), "experienceengine-codex-mediated-"));
    tempDirs.push(homeDir);
    writeCodexConfig(
      homeDir,
      `model = "gpt-5.4"
`
    );
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
      env: {
        EXPERIENCE_ENGINE_USE_HOST_LLM: "true",
        EXPERIENCE_ENGINE_ADAPTER: "codex"
      },
      homeDir,
      codexExecRunner(command) {
        const outputPathIndex = command.args.findIndex((value) => value === "--output-last-message");
        const outputPath = outputPathIndex >= 0 ? command.args[outputPathIndex + 1] : undefined;
        if (!outputPath) {
          throw new Error("missing output path");
        }
        writeFileSync(outputPath, "definitely not json", "utf8");
        return {
          stdout: "",
          stderr: "",
          exitCode: 0
        };
      }
    });

    await worker.drain();

    expect(jobRepo.getById("job_mediated_invalid")?.status).toBe("failed");
    expect(jobRepo.getById("job_mediated_invalid")?.failure_bucket).toBe("mediated_invalid_json");
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
});
