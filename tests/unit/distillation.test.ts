import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../src/config/load-config.js";
import { LlmDistiller } from "../../src/distillation/llm-distiller.js";
import { DistillationQueueWorker } from "../../src/distillation/queue-worker.js";
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
  while (tempDirs.length) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

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
});

describe("DistillationQueueWorker", () => {
  it("promotes pending candidates into formal nodes", async () => {
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
    expect(nodeRepo.listByState("candidate")).toHaveLength(1);
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
});
