# Changelog

## [0.7.2] - 2026-08-08

### Changed

- Generated default `config.toml` now seeds `[ui].placement = "overlay"` (previously `popup` at 90%); switch to `popup` explicitly for the session-modal picker
- Opening an existing worktree checkout now applies the tab layout (same as create). Focusing an existing Herdr workspace is unchanged.
- Removed stale docs and dead internal exports ([#41](https://github.com/andrewchng/herdr-sessionizer/pull/41)).

Thanks @nilp0inter ([#31](https://github.com/andrewchng/herdr-sessionizer/pull/31)).

## [Unreleased]

### Added

- Open GitHub pull requests as worktree candidates ([#43](https://github.com/andrewchng/herdr-sessionizer/pull/43)): open PRs (including drafts and cross-fork heads) appear in the worktree picker when [`gh`](https://cli.github.com/) is installed and authenticated. Selecting one fetches `pull/<n>/head` into a local `pr-<n>` branch, creates a worktree workspace named `pr-<n>-<short-title>` (layout on first create only), and configures `branch.pr-<n>` upstream so `git pull` inside the worktree tracks the live PR head — including pushes from cross-fork contributors. `gh` is a soft dependency: if it is missing or unauthenticated, PR rows are simply omitted and the git-only flow is unchanged ([#33](https://github.com/andrewchng/herdr-sessionizer/issues/33)).
- PR rows carry `[draft]` / `[fork]` badges; the picker preview shows the PR author and head repo (e.g. `author: pperanich | fork: pperanich/herdr-sessionizer`).
- Optional `[worktree] fetch_on_open = true` runs `git fetch --prune origin` before the worktree picker so new remote branches appear without a manual fetch (default `false`).

## [0.7.1] - 2026-08-01

### Fixed

- Worktree branch name prompt: <kbd>Esc</kbd> (and Ctrl+C) cancel the flow and exit Sessionizer instead of leaving you stuck in the prompt (uses fzf free-text, same cancel path as pickers)

## [0.7.0] - 2026-08-01

### Added

- `[ui].placement` for how Sessionizer / Worktree pickers open in Herdr: `overlay`, `split`, or `popup` (popup requires Herdr `>= 0.7.4`)
- Optional `[ui].width` / `[ui].height` for popup outer size (terminal cells or percentages such as `"80%"`)

### Changed

- Picker placement moves from `[layout].placement` to `[ui]`; workspace bootstrap `[layout]` now only carries `focus` (no fallback for the old key)
- New default config uses `[ui].placement = "popup"` with `width` / `height` = `"80%"`
- Placement is no longer required when `[tabs]` are defined (omitted `[ui]` still falls back to `overlay`)
- Minimum Herdr version is now `0.7.4` (`min_herdr_version` + README prerequisites; required for popup picker placement)

## [0.6.2] - 2026-07-26

### Added

- Official Linux platform support (`platforms = ["macos", "linux"]`); README and fzf install hint updated accordingly

### Fixed

- Worktree duplicate-branch recovery now checks git state (`localBranchExists`) instead of sniffing herdr stderr for `a branch named`
- Config with only `[projects]` (no `[layout]` / `[tabs]`) loads successfully; empty tabs open a plain shell; layout focus/placement stay required when tabs are defined

### Changed

- README documents minimal projects-only config behavior

Thanks @pperanich ([#25](https://github.com/andrewchng/herdr-sessionizer/pull/25), [#28](https://github.com/andrewchng/herdr-sessionizer/pull/28), [#29](https://github.com/andrewchng/herdr-sessionizer/pull/29)).

## [0.6.1] - 2026-07-21

### Fixed

- Expand a bare `~` project root to the home directory (was silently ignored)

### Changed

- Dev dependency: TypeScript 7.0 (typecheck only; no runtime change)
- README cleanup for UX flow, config field reference, and glob roots guidance

Thanks @pperanich ([#26](https://github.com/andrewchng/herdr-sessionizer/pull/26)).

## [0.6.0] - 2026-07-08

### Added

- Glob expressions in `[projects].roots` for nested clone layouts (e.g. ghq-style `~/Projects/github.com/*`)
- Glob expansion composes with `git_only` and `depth` — patterns expand to base directories, then existing discovery runs unchanged

### Changed

- README and sessionizer-layout-editor discovery reference document glob roots (`*`, `**`, and plain paths)

Thanks @nilp0inter ([#21](https://github.com/andrewchng/herdr-sessionizer/pull/21)).

## [0.5.1] - 2026-07-07

### Changed

- New installs default `git_only` to `true` in generated `config.toml`; existing configs without `git_only` still default to `false`
- README documents `git_only` and `depth`; `sessionizer-layout-editor` skill refactored with discovery reference

## [0.5.0] - 2026-07-04

### Added

- Optional `[projects].git_only` and `[projects].depth` config for git-aware project discovery under `projects.roots`
- Symlink-safe git discovery with cycle detection when `git_only = true`

### Changed

- README documents `git_only` and `depth` project discovery options
- Generated default `config.toml` includes commented `git_only` and `depth` fields

Thanks @MMSs ([#20](https://github.com/andrewchng/herdr-sessionizer/pull/20)).

## [0.4.0] - 2026-06-30

### Added

- Worktree branch/worktree picker that can reopen existing worktree workspaces, reopen existing checkouts, create worktrees from local branches, or create local worktrees from remote branches
- Worktree picker previews with branch type, hidden checkout path details, and README/directory previews where available
- Worktree flow coordinator and candidate discovery tests covering Enter, Esc, no-candidate, local branch, remote branch, and reopen-as-is paths

### Changed

- Worktree flow now uses <kbd>Esc</kbd> from the branch/worktree picker to enter a new branch name
- README documents the Sessionizer and Worktree UX flows

## [0.3.0] - 2026-06-29

### Added

- Optional per-split `ratio` support on layout pane definitions for `right` and `down` splits
- Ratio validation during config loading, including clear failures for non-numeric, root-pane, and out-of-range values
- Focused tests for ratio parsing, nested split behavior, split flag wiring, and ratio edge cases

### Changed

- README now documents per-split ratio behavior, bootstrap-only application, and local-to-each-split semantics
- The generated default layout example and sample Sessionizer config now demonstrate ratio usage for a narrower assistant pane

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-06-24

### Added

- Per-repo layout overrides at `<project>/.sessionizer/config.toml`
- `resolveLayoutConfig()` — repo-local layout on new workspace bootstrap, global fallback
- Clear errors when a repo-local config file exists but is invalid

### Changed

- README documents per-repo override lookup, examples, and behavior table

## [0.1.0] - 2026-06-23

### Added

- Project sessionizer — `fzf` picker, focus existing workspaces, layout bootstrap for new ones
- Worktree picker — create or reopen Git worktree workspaces, with duplicate-branch recovery
- Config-driven tab/pane layout via global `config.toml`
- `fzf` previews — optional `bat` for README previews in the picker
- macOS platform declaration in plugin manifest
- Prerequisites: Herdr >= 0.7.0, Bun, `fzf`
