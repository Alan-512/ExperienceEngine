## Context

The repository already has many development documents, but there was no explicit directory entrypoint saying that the architecture blueprint must remain current after architecture-changing work. The new blueprint is meant to help coding agents quickly understand the current system before proposing or implementing structural changes.

## Goals / Non-Goals

**Goals:**

- Make the architecture blueprint the authoritative current-state reference.
- Make the optimization roadmap explicitly future-facing.
- Define a simple update rule for architecture-changing work.
- Keep the documentation structure lightweight.

**Non-Goals:**

- Redesign the runtime or module structure.
- Change public README installation guidance.
- Add a documentation build system.
- Move all historical internal docs into public docs.

## Decisions

### `architecture.md` describes current reality only

The blueprint should explain what the system is now: modules, domain objects, flows, storage, and boundaries. It must not accumulate future proposals or design debates.

Alternative considered:
- Keep the blueprint inside `internal-docs`: rejected because architecture-changing development work needs a stable repo-local reference path that future agents can find.

### Roadmap stays separate from blueprint

`architecture-optimization-roadmap.md` holds direction, phases, and constraints. This avoids mixing "what exists" with "what should change."

Alternative considered:
- Add a future section to the blueprint: rejected because it makes the current-state document less reliable for quick orientation.

### New architecture docs are force-added when committed

`docs/development` is ignored for new files but already contains tracked files. New architecture docs can still be committed with `git add -f`.

Alternative considered:
- Change `.gitignore`: rejected for this documentation-only change because it could unexpectedly expose unrelated development drafts.

## Risks / Trade-offs

- [Docs can still drift] -> The README update rule makes drift visible during future changes, but enforcement still depends on reviews.
- [Ignored directory hides new docs from status] -> Document the need for `git add -f` when committing these files.
- [Blueprint becomes too large] -> Keep it descriptive and remove stale sections when architecture moves.
