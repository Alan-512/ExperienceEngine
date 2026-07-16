## Context

D1 creates an inspectable one-file review directory. D2 turns that exact reviewed manifest into a portable artifact while preventing accidental content inclusion.

## Decisions

### Deterministic tar.gz

Use a maintained archive dependency. Do not hand-write tar structures or depend on host shell commands.

### Exact one-file input

The review directory must contain one regular file named `manifest.json`. Extra entries and links fail closed.

### Atomic no-overwrite output

The final archive is written through a temporary sibling and committed only to a non-existing target path.

### Revalidate at archive time

The exact edited manifest is parsed and strict-validated immediately before archiving.

## Non-Goals

- no network upload
- no automatic GitHub issue creation
- no arbitrary attachments in v1
- no raw logs/databases/settings
