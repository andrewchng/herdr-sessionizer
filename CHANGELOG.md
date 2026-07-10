# Changelog

## [0.8.0] - 2026-07-10

### Changed

- `sessionizer.open` now opens the selected folder as a plain terminal workspace instead of applying the configured `[tabs.*]` layout. Selecting an existing session still just focuses it. This keeps new sessions lightweight on small screens.

### Added

- New `sessionizer.open-layout` action: opens the same picker but applies the configured `[tabs.*]` layout to a newly created workspace (the previous `sessionizer.open` behavior). Bind it to a separate key when you want the full editor/agent/git layout.

## [0.7.0] - 2026-07-09

### Added

- Unified frecency picker: the Sessionizer picker now merges open workspaces, frecency-ranked directories, current-folder neighbours (siblings + children), and configured `projects.roots` into one ranked list
- Frecency ranking backed by [zoxide](https://github.com/ajeetdsouza/zoxide) when installed (reads `zoxide query --list --score`, records opens via `zoxide add`); falls back to a built-in store at `${XDG_STATE_HOME:-~/.local/state}/herdr/sessionizer/frecency.json`
- In-picker "find" toggle (`ctrl-f`) that deep-searches the filesystem with `fd` (falling back to `find`), like sesh's `fd -H -d 2 -t d . ~`
- Source-toggle key bindings: `ctrl-a` all · `ctrl-o` open · `ctrl-r` recent · `ctrl-f` find
- New optional config sections: `[find]` (`roots`, `depth`), `[current]` (`enabled`, `siblings`, `children`), `[recent]` (`enabled`, `limit`)

### Changed

- The two-step picker (open workspaces → Esc → projects) is replaced by a single unified picker; selecting an open workspace focuses it, selecting a directory creates + lays out a workspace (see ADR-0002)
- `sessionizer.open` now passes the launching workspace's cwd to the picker (`SESSIONIZER_CWD`) so the current-folder and find sources have a meaningful base
- `expandHome` now also expands a bare `~`

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
