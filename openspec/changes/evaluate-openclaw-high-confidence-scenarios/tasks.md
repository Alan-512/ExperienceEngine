## 1. Spec And Docs

- [x] 1.1 Add the OpenClaw high-confidence scenario evaluation spec
- [x] 1.2 Add developer documentation for the scenario pack workflow
- [x] 1.3 Link the new workflow from the existing baseline evaluation docs

## 2. Scenario Runner

- [x] 2.1 Add a built-in `high-confidence` OpenClaw scenario pack definition
- [x] 2.2 Add an evaluation runner that executes the scenario pack through the real `openclaw agent` CLI
- [x] 2.3 Persist raw OpenClaw run outputs and a structured scenario report under `artifacts/evaluations/openclaw/<timestamp>/`

## 3. Reporting And CLI

- [x] 3.1 Add a report collector that maps scenario session ids to ExperienceEngine records, candidates, jobs, and injected nodes
- [x] 3.2 Add `ee evaluate openclaw-scenarios --pack high-confidence [--repo-root PATH] [--output-dir PATH] [--dry-run]`
- [x] 3.3 Update CLI usage text and user-facing guidance for the new command

## 4. Validation

- [x] 4.1 Add unit tests for the scenario runner and command parsing
- [x] 4.2 Pass `pnpm check`
- [x] 4.3 Run the `high-confidence` pack in the current WSL OpenClaw environment and record the first artifact set
