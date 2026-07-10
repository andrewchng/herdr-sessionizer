# ADR-0002: Unified frecency picker with in-picker find

## Status

Accepted

## Context

The original Sessionizer flow was a two-step picker: first a list of open Herdr
workspaces, then — on `Esc` — a list of projects discovered under the configured
`projects.roots`. This was limited:

- it only surfaced configured roots, so switching to a directory outside them
  was impossible;
- there was no recency/frequency signal, so frequently-used projects sank into
  an alphabetical list;
- there was no way to reach an arbitrary folder on the machine.

The tmux session manager [`sesh`](https://github.com/joshmedeski/sesh) solves the
same problem by merging several sources (open tmux sessions, config, zoxide
frecency) into one fuzzy list, with `fzf` key-bindings to swap sources and a
"find" binding that shells out to `fd`.

## Decision

Replace the two-step picker with a single unified picker over a merged list of
**candidates**. Each candidate is either:

- an **open workspace** (selecting it focuses the workspace), or
- a **directory** (selecting it creates a workspace and applies the layout).

Directory candidates come from four **sources**:

- `recent` — frecency-ranked directories;
- `current` — sibling and child directories of the launch cwd;
- `root` — the existing `projects.roots` discovery;
- `find` — an on-demand deep filesystem search.

The default view merges `open → recent → current → root`; that order doubles as
the dedup priority, so an open workspace always shadows a bare directory at the
same path (consistent with ADR-0001: reopen existing workspaces as-is).

### Frecency

Frecency is backed by **zoxide** when it is installed — reading
`zoxide query --list --score` and recording opens with `zoxide add` — so the
ranking benefits from the user's existing shell `cd` history. When zoxide is
absent, a self-contained JSON store with zoxide-style tiered recency weighting
is used instead.

### Find

Deep search is an in-picker toggle (`ctrl-f`), not a separate action. `fzf`
`reload` bindings re-invoke a `list` subcommand (`src/sessionizer/list.ts`) for
each source, keeping row format identical across the initial view and every
reload. `find` uses `fd` (`--type d --hidden --max-depth <depth>`), falling back
to POSIX `find`, over the configured `[find].roots` (default: home, depth 2).

## Consequences

### Positive

- one entry point surfaces open, recent, nearby, and configured projects at once;
- frecency puts the most likely target first without configuration;
- arbitrary folders are reachable via `ctrl-f`;
- reuse of zoxide keeps ranking in sync with the rest of the user's tooling.

### Negative

- an extra process spawns per source reload (`bun run list.ts`), adding minor
  latency to source toggles;
- behavior now depends on optional external tools (`fd`, `zoxide`) with
  documented fallbacks;
- the picker no longer has a distinct "these are new projects" step — new vs
  existing is conveyed by the source column and preview instead.

## Notes

Layout bootstrap remains create-time only (ADR-0001). A directory selection that
already matches an open workspace's cwd focuses that workspace rather than
recreating it.
