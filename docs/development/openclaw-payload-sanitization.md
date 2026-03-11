# OpenClaw Payload Sanitization

This document defines how raw OpenClaw runtime payloads are converted into repository-safe fixtures.

## Why This Exists

Real payload captures can contain:

- tokens
- local filesystem paths
- channel identifiers
- account or user metadata
- transient IDs that create noisy fixture diffs

Fixtures must preserve parser-relevant structure without leaking sensitive or machine-specific data.

## Sanitization Rules

### Must Redact

- any auth token, cookie, API key, or bearer credential
- user-identifying fields such as email, phone, usernames, display names, sender/recipient handles
- channel- or account-specific identifiers when they are not required for parser behavior

### Must Normalize

- local paths such as repo roots, cwd, workspace paths
- UUID-like ephemeral identifiers
- machine-specific absolute file references

### Should Preserve

- field names
- object nesting
- array ordering where parser behavior depends on it
- tool names, exit codes, statuses, and summaries
- task text and context summaries when they are needed for trigger behavior

### May Remove

- large unrelated payload branches
- binary blobs
- transport metadata irrelevant to parser behavior

## Repository Policy

- never commit raw payload captures
- only commit sanitized curated fixtures
- prefer the smallest payload that still reproduces the behavior
- if a field was removed, be sure its absence does not change replay semantics

## Helper Script

Use the repository helper to sanitize a raw payload capture:

```bash
pnpm tsx scripts/openclaw/promote-runtime-payload.ts /path/to/raw-payload.json
```

The helper currently redacts:

- secret-like keys
- path-like keys
- identity-like keys
- UUID-like strings
- common token patterns

Manual review is still required before promotion into `tests/fixtures/openclaw/`.
