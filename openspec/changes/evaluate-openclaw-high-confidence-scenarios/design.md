## Context

The current `ee evaluate openclaw-baseline` command produces a host-wide summary, but it does not guarantee that the underlying task runs are high-confidence or even comparable. In the current WSL environment, OpenClaw defaults to `/home/seed/.openclaw/workspace`, so evaluation prompts must explicitly normalize the repo root inside the message body. For v3, OpenClaw remains the learning-loop baseline host, so we need a small, stable scenario pack that can be rerun after distillation or gating changes and can answer: did the same family of tasks produce candidates, distillation jobs, injected nodes, and outcome signals?

## Goals / Non-Goals

**Goals:**
- Define a small, read-only OpenClaw scenario pack that runs in the current repo and covers high-confidence `test_debug` and `build_debug` flows.
- Execute the pack through the real `openclaw agent` CLI from the ExperienceEngine CLI.
- Persist raw OpenClaw JSON responses alongside a structured scenario report that maps scenario runs back to ExperienceEngine records, candidates, jobs, and nodes.
- Keep the output local-only and compatible with the existing baseline artifact directory layout.

**Non-Goals:**
- Do not add new product features or change intervention policy.
- Do not add a general-purpose workload scheduler for distillation.
- Do not make Claude Code or Codex equal evaluation baselines for this phase.
- Do not introduce destructive scenarios or scenarios that modify tracked files.

## Decisions

### Decision: Add a dedicated `openclaw-scenarios` evaluate target
The scenario runner will be a sibling to `openclaw-baseline`, not a flag on top of it. Baseline remains a passive snapshot command; scenarios are an active execution workflow. This keeps the existing command stable and makes the new workflow explicit.

### Decision: Ship a built-in `high-confidence` scenario pack first
The first pack will be code-defined and include a small number of read-only scenarios:
- repo-root sanity
- test-debug repeated verification
- build-debug repeated verification

Each scenario prompt will explicitly tell OpenClaw to `cd` into the repository root before running commands. This avoids relying on unsupported host-level cwd flags.

### Decision: Use real OpenClaw CLI execution with injected session ids
The runner will call `openclaw agent --session-id ... --message ... --json` and persist the raw JSON payload per scenario run. Session ids will be deterministic per run so ExperienceEngine records can be queried by session id afterwards.

### Decision: Report scenario outcomes from ExperienceEngine persistence, not only OpenClaw CLI output
The scenario report will include:
- raw OpenClaw CLI result
- latest ExperienceEngine input record for the session
- latest candidate for the session's record
- any distillation jobs linked to that candidate
- injected nodes if present

This keeps the evaluation centered on the learning loop rather than on surface CLI success alone.

### Decision: Keep the first runner synchronous and small
The command will execute scenarios sequentially in one process. This is slower but keeps logs, artifacts, and failure diagnosis simple for the current WSL baseline stage.

## Risks / Trade-offs

- [OpenClaw runtime latency] -> Sequential scenario execution may take a few minutes; keep the pack small and commands read-only.
- [Host workspace drift] -> Every scenario prompt explicitly normalizes the repo root before doing work.
- [Cold-start still yields little data] -> Use paired repeated scenarios so the same task family appears at least twice in one run.
- [Session/report mismatch] -> The runner uses deterministic session ids and queries ExperienceEngine persistence by session id after each run.

