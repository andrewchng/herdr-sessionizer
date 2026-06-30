# Changelog

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
