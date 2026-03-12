## 1. Define Sanitization Scope

- [x] 1.1 Encode the prompt-contamination behavior in an OpenSpec delta for `openclaw-experience-plugin`
- [x] 1.2 Document the sanitizer boundary and exclusions for ExperienceEngine-owned injected headings

## 2. Implement Summary Sanitization

- [x] 2.1 Add a shared text sanitizer that strips leading ExperienceEngine injection blocks before building `task_summary`
- [x] 2.2 Cover prompt-build and finalize-style payloads in unit/integration regression tests

## 3. Validate

- [x] 3.1 Run `npx @fission-ai/openspec@latest validate --changes --strict`
- [x] 3.2 Run `pnpm check`
