## 1. Spec And Docs

- [x] 1.1 新增 OpenClaw baseline evaluation capability spec
- [x] 1.2 新增 OpenClaw baseline evaluation 开发文档
- [x] 1.3 在 README / user guide 中链接 baseline evaluation 文档

## 2. Evaluation Service

- [x] 2.1 新增 OpenClaw baseline 汇总服务，输出 record / candidate / job / node / feedback 指标
- [x] 2.2 支持将评估结果渲染为 JSON 与 Markdown
- [x] 2.3 将本地产物默认写入 `artifacts/evaluations/openclaw/<timestamp>/`

## 3. CLI And Tooling

- [x] 3.1 新增 `ee evaluate openclaw-baseline` CLI 命令
- [x] 3.2 支持可选 `--lookback-hours` 和 `--output-dir` 参数
- [x] 3.3 将本地产物目录加入 `.gitignore`

## 4. Validation

- [x] 4.1 为 baseline 服务与 CLI 命令补单测
- [x] 4.2 通过 `pnpm check`
- [x] 4.3 在当前 WSL 的真实 OpenClaw 环境生成首份 baseline 快照
