# Provider Distillation Matrix

This document is the current implementation truth for ExperienceEngine distillation providers as of `2026-03-20`.

It answers five questions:

- which providers are implemented
- which protocol each provider uses
- which environment variables are required
- whether the provider is a native adapter or a dedicated OpenAI-compatible profile
- which selection flow is the preferred one

## Current Status

ExperienceEngine now supports three provider classes:

- native protocol adapters
- provider-specific OpenAI-style adapters
- provider-specific OpenAI-compatible profiles

`openai_compatible` remains supported, but it is now explicitly a fallback provider, not the primary abstraction.

## Preferred Selection Flow

The preferred user flow is now:

1. `ee models list <provider> [query]`
2. `ee config set distillation.provider <provider>`
3. `ee config set distillation.model <modelId>`
4. set the provider credential env

Directly setting `EXPERIENCE_ENGINE_DISTILLER_MODEL` is now a compatibility path, not the primary UX.

## Matrix

| Provider | Class | Protocol | Catalog source | Required env | Preferred model selection |
| --- | --- | --- | --- | --- | --- |
| `openai` | native | OpenAI Chat Completions | `models.dev` | `OPENAI_API_KEY` | `ee models list openai` then `ee config set distillation.model <modelId>` |
| `anthropic` | native | Anthropic Messages API | `models.dev` | `ANTHROPIC_API_KEY` | `ee models list anthropic` then `ee config set distillation.model <modelId>` |
| `gemini` | native | Gemini `generateContent` | `models.dev` | `GEMINI_API_KEY` | `ee models list gemini` then `ee config set distillation.model <modelId>` |
| `azure_openai` | provider-specific | Azure OpenAI Chat Completions | `models.dev` | `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY` | Set provider, then set deployment name as the model |
| `bedrock` | native | Bedrock `Converse` | `models.dev` | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` | `ee models list bedrock` then `ee config set distillation.model <modelId>` |
| `openrouter` | provider-specific | OpenAI-style Chat Completions | `models.dev` | `OPENROUTER_API_KEY` | `ee models list openrouter` then `ee config set distillation.model <modelId>` |
| `openai_compatible` | generic fallback | OpenAI-compatible Chat Completions | compatibility-only | `EXPERIENCE_ENGINE_DISTILLER_API_KEY`, `EXPERIENCE_ENGINE_DISTILLER_BASE_URL`, `EXPERIENCE_ENGINE_DISTILLER_MODEL` | Compatibility path only |
| `dashscope` | dedicated profile | OpenAI-compatible Chat Completions | `models.dev` | `DASHSCOPE_API_KEY` | `ee models list dashscope` then `ee config set distillation.model <modelId>` |
| `deepseek` | dedicated profile | OpenAI-compatible Chat Completions | `models.dev` | `DEEPSEEK_API_KEY` | `ee models list deepseek` then `ee config set distillation.model <modelId>` |
| `moonshot` | dedicated profile | OpenAI-compatible Chat Completions | `models.dev` | `MOONSHOT_API_KEY` | `ee models list moonshot` then `ee config set distillation.model <modelId>` |
| `zhipu` | dedicated profile | OpenAI-compatible Chat Completions | `models.dev` | `ZHIPU_API_KEY` | `ee models list zhipu` then `ee config set distillation.model <modelId>` |
| `siliconflow` | dedicated profile | OpenAI-compatible Chat Completions | `models.dev` | `SILICONFLOW_API_KEY` | `ee models list siliconflow` then `ee config set distillation.model <modelId>` |
| `minimax` | dedicated profile | OpenAI-compatible Chat Completions | `models.dev` | `MINIMAX_API_KEY` | `ee models list minimax` then `ee config set distillation.model <modelId>` |
| `volcengine_ark` | dedicated profile | OpenAI-compatible Chat Completions | static fallback | `VOLCENGINE_ARK_API_KEY` | `ee models list volcengine_ark` then `ee config set distillation.model <modelId>` |
| `tencent_hunyuan` | dedicated profile | OpenAI-compatible Chat Completions | static fallback | `TENCENT_HUNYUAN_API_KEY` | `ee models list tencent_hunyuan` then `ee config set distillation.model <modelId>` |
| `baidu_qianfan` | dedicated profile | OpenAI-compatible Chat Completions | static fallback | `BAIDU_QIANFAN_API_KEY` | `ee models list baidu_qianfan` then `ee config set distillation.model <modelId>` |

## Native vs Dedicated Profile

Use this rule:

- prefer a native adapter when the provider has a meaningfully different request or auth protocol
- prefer a dedicated profile when the provider can safely reuse the OpenAI-style execution path but still needs its own env names, default endpoint, and doctor guidance

In the current implementation:

- native: `openai`, `anthropic`, `gemini`, `bedrock`
- provider-specific OpenAI-style: `azure_openai`, `openrouter`
- dedicated compatible profile: `dashscope`, `deepseek`, `moonshot`, `zhipu`, `siliconflow`, `minimax`, `volcengine_ark`, `tencent_hunyuan`, `baidu_qianfan`

## Doctor Expectations

`ee doctor codex` and `ee doctor claude-code` should now always report:

- `Provider`
- `Explicit provider configured`
- `Model` when available
- `Base URL`
- `Missing env` when configuration is incomplete
- `Setup hint` when a known provider is missing required credentials

Examples:

- `gemini` should point users to `GEMINI_API_KEY`
- `bedrock` should point users to `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `AWS_REGION`
- `openai_compatible` should point users to the legacy EE-prefixed env trio

## Implementation References

- Provider registry: [registry.ts](/mnt/d/project/experienceengine/src/distillation/providers/registry.ts)
- Provider types: [types.ts](/mnt/d/project/experienceengine/src/distillation/providers/types.ts)
- Distiller execution path: [llm-distiller.ts](/mnt/d/project/experienceengine/src/distillation/llm-distiller.ts)
- Doctor output: [doctor.ts](/mnt/d/project/experienceengine/src/cli/commands/doctor.ts)

## Verification Baseline

The current provider matrix is backed by these targeted checks:

- `tests/unit/provider-resolution.test.ts`
- `tests/unit/provider-registry.test.ts`
- `tests/unit/provider-openai-compatible.test.ts`
- `tests/unit/distillation.test.ts`
- `tests/unit/doctor-command.test.ts`

Use this command for the provider verification subset:

```bash
pnpm exec vitest run \
  tests/unit/provider-resolution.test.ts \
  tests/unit/provider-registry.test.ts \
  tests/unit/provider-openai-compatible.test.ts \
  tests/unit/distillation.test.ts \
  tests/unit/doctor-command.test.ts \
  tests/unit/codex-installer.test.ts \
  tests/unit/claude-code-doctor.test.ts
```
