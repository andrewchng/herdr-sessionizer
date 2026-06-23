# PRD: Worktree close picker

Status: Ready for implementation
Owner: Sessionizer plugin
Related: `sessionizer.open`, `sessionizer.worktree-open`, ADR-0001

## Summary

Add a fuzzy-picker workflow that closes existing Herdr worktree workspaces and removes their underlying Git worktree checkouts in one step. The new surface mirrors the existing `sessionizer.open` picker so the user gets the same "list → pick → act" ergonomics they already use for focusing a workspace, but the action is destructive and batched.

The Herdr CLI already exposes `herdr worktree remove --workspace ID [--force] [--json]`, which closes the workspace and removes the git worktree in a single call. This PRD is about wrapping that primitive in a fzf-driven UX, not about introducing new removal semantics.

## Goals

- A user can fuzzy-pick one or more open worktree workspaces and have them fully cleaned up (Herdr workspace + git worktree) in a single invocation.
- The picker is reachable from inside an existing Herdr session via a new plugin action, with no need to drop into a separate terminal.
- Multi-select is the default. Cleanup is naturally batched and the underlying call is per-row, so a single failure does not abort the batch.
- The flow reuses the existing fzf wrapper (`src/ui/fzf.ts`), the `workspaceRow` shape (after extraction), and the runtime-injection pattern used by `src/sessionizer.ts` and `src/worktree.ts`.

## Non-goals

- Removing worktrees that have no open Herdr workspace (orphaned git worktrees). Out of scope; can be a follow-up that uses `git worktree list --porcelain` for discovery.
- Removing non-worktree workspaces. The picker filters to worktree-provenance workspaces only.
- A confirmation step. The fzf preview pane is the safety net; we deliberately do not add a second prompt.
- A CLI flag on `herdr-worktree`. The plugin surface is the only entry point in this iteration.
- Auto-passing `--force` to `herdr worktree remove`. Failures (e.g. dirty worktrees) surface as per-row errors and the user decides whether to retry.
- Filtering out the currently-focused workspace from the picker. It is allowed through; if `herdr worktree remove` rejects it, the failure surfaces as a per-row error like any other.

## User experience

### Triggering

The user invokes the new plugin action `sessionizer.worktree-close` (typically via a keybinding they wire in their own Herdr config, exactly as they do for `sessionizer.open` and `sessionizer.worktree-open`).

A new pane `worktree-close` is registered in `herdr-plugin.toml` that runs the picker.

### Picker contents

Rows are sourced from `Workspaces.list()` filtered to those where `workspace.worktree` is set. Each row is rendered with the (extracted) `workspaceRow` shape, which now includes a `repo_name` column:

| Positional | Field     | Source                                                                              |
| ---------- | --------- | ----------------------------------------------------------------------------------- |
| `{1}`      | id        | `workspace.workspace_id`                                                            |
| `{2}`      | label     | `workspace.label` (or basename fallback)                                            |
| `{3}`      | summary   | `workspaceSummary(workspace)`                                                       |
| `{4}`      | cwd       | `workspace.cwd` / `worktree.checkout_path` / `worktree.repo_root` / `worktree.path` |
| `{5}`      | branch    | `workspace.worktree.branch`                                                         |
| `{6}`      | repo_name | `workspace.worktree.repo_name`                                                      |
| `{7}`      | tabs      | `workspace.tab_count`                                                               |
| `{8}`      | panes     | `workspace.pane_count`                                                              |

The picker is multi-select via fzf's `--multi`. Marking is done with `Tab`, and `Enter` acts on the full set.

Rows are a snapshot at picker-open time. A workspace that closes itself in another Herdr session while fzf is up will still appear and may fail at action time; that failure is reported as a per-row error.

### Display and preview

- `withNth: 2` (the `label` column) is the primary display, matching the existing sessionizer picker.
- The fzf header explains the gesture: `Tab mark, Enter remove, Esc cancel`.
- The preview pane shows, for the highlighted row, reading the positionals above:
  - label (`{2}`), summary (`{3}`), branch (`{5}`), repo name (`{6}`), tabs/panes (`{7}` `{8}`)
  - cwd / checkout path (`{4}`)
  - last commit subject and timestamp via `git -C <cwd> log -1 --pretty=format:"%h %ad %s" --date=short`
  - a dirty marker via `git -C <cwd> status --porcelain` (a non-empty result means the worktree has uncommitted changes; the close will fail without `--force`)

This reuses the shell-snippet style of `src/ui/previews.ts`. The new preview is added as `WORKTREE_CLOSE_PREVIEW` in the same file and reads the same row positionals.

### Sorting and grouping

Rows are grouped by `workspace.worktree.repo_name` so related worktrees are adjacent. Within a group, rows sort by branch name.

### Action

For each selected workspace id, the flow calls `Worktrees.remove(workspaceId)` (which shells out to `herdr worktree remove --workspace <id> --json`). `Worktrees.remove` is a new method on the existing class.

`remove` throws `HerdrError` on non-zero exit. The core flow catches it, reads `.stderr` for the error message, and continues to the next selected row. The runtime-injected `remove` seam preserves this contract.

Per-row output:

```
✓ removed <branch> (<workspace_id>)
✗ failed to remove <branch> (<workspace_id>): <stderr>
```

After all rows are processed, a summary line:

```
Removed N worktree(s), K failed.
```

A non-zero exit code is returned iff at least one row failed.

### Empty state

If the filtered workspace list is empty, the flow prints a single hint and exits 0:

```
No open worktree workspaces. Create one with `sessionizer.worktree-open`.
```

## Plugin manifest changes

`herdr-plugin.toml` gains two entries that mirror the existing `worktree-open` pair:

```toml
[[actions]]
id = "worktree-close"
title = "Close worktree"
command = ["bun", "run", "src/open-worktree-close-pane.ts"]

[[panes]]
id = "worktree-close"
title = "Worktree close"
placement = "overlay"
command = ["bun", "run", "src/worktree-close-pane.ts"]
```

The action entry point follows the same thin-wrapper pattern as `src/open-worktree-pane.ts`.

## Implementation outline

### New files

- `src/worktree-close.ts` — the core flow, runtime-injected for testability. Mirrors the structure of `src/worktree.ts`.
- `src/worktree-close-pane.ts` — one-liner pane entry point: imports `runWorktreeClose`, calls it with the default runtime, logs and exits 1 on failure. Mirrors `src/sessionizer-pane.ts` (no env-var scaffolding, since the close flow takes no caller-supplied arguments).
- `src/open-worktree-close-pane.ts` — the action entry point. Mirrors `src/open-worktree-pane.ts`; opens the `worktree-close` pane using `config.layout.placement`.
- `src/ui/workspace-row.ts` — extracted `workspaceRow` and `extractWorkspaceId` (currently private to `src/sessionizer.ts`). Adding `repo_name` brings the column count from 7 to 8.

### Modified files

- `src/sessionizer.ts` — replace the local `workspaceRow` / `extractWorkspaceId` / `WORKSPACE_ROW_DELIMITER` with imports from `src/ui/workspace-row.ts`. The column-count change from 7 to 8 is internal to the row format and is absorbed by both the sessionizer picker and the new close picker.
- `src/ui/previews.ts` — add `WORKTREE_CLOSE_PREVIEW`. Update `WORKSPACE_PREVIEW` to read the new 8-column positionals (`{2}..{8}`) and to print `repo_name` (`{6}`) when present.
- `src/ops/worktrees.ts` — add a `remove(workspaceId: string, options?: { force?: boolean }): Promise<void>` method that calls `herdr worktree remove --workspace <id> --json` (plus `--force` when `options.force` is true) and lets `Herdr.run` throw `HerdrError` on failure. Mirrors the existing `create` / `open` shape.
- `herdr-plugin.toml` — register the new action and pane.
- `README.md` — document the new action, pane, and suggested keybinding.

### Runtime shape (proposed)

```ts
interface WorktreeCloseRuntime {
  workspaces: Pick<Workspaces, "list">;
  remove: (workspaceId: string) => Promise<void>; // throws HerdrError on failure
  pickRows: (
    rows: readonly string[],
    options?: PickOptions
  ) => Promise<string[] | null>;
  logger: Pick<typeof console, "log" | "error">;
  exit: (code: number) => never;
}
```

`remove` is a mockable seam (mirrors `worktrees: { open, create }` in `src/worktree.test.ts`). Tests inject a `remove` that throws a `HerdrError` with a known `stderr` to exercise the per-row failure path.

### `worktree-close-pane.ts` shape

```ts
import { runWorktreeClose } from "./worktree-close.ts";

runWorktreeClose().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
```

No env-var reading; the close flow is fully self-driving from the picker.

## Testing

Following the project's `tdd` skill and the test style of `src/sessionizer.test.ts` and `src/worktree.test.ts`:

- `src/worktree-close.test.ts` covers:
  - empty workspace list (after `worktree` filter) → prints hint and exits 0
  - single selection → one `remove` call, one success line, summary `Removed 1 worktree(s), 0 failed.`
  - multi-selection → all `remove` calls happen, success and failure lines are emitted in selection order, summary counts are correct
  - per-row failure (`remove` throws `HerdrError` with a known `stderr`) → that row's error is captured, other rows still processed, exit code reflects failures
  - workspace filter rejects workspaces with no `worktree` provenance (covered via injected `workspaces.list` returning a mixed list)
  - currently-focused workspace is allowed through (no special-casing) → covered by the mixed-list test, since filtering only excludes non-worktree workspaces, not the focused one
- `src/ui/workspace-row.test.ts` (new) — unit tests for the extracted `workspaceRow` and `extractWorkspaceId`:
  - `repo_name` column is populated from `workspace.worktree.repo_name` and is empty otherwise
  - `extractWorkspaceId` returns the first column regardless of trailing columns
  - fields containing tabs or newlines are sanitized (existing behavior preserved)
- Preview snippet coverage is not unit-tested; it follows the same shell style as `WORKSPACE_PREVIEW` and is exercised manually.

## Acceptance criteria

1. `herdr plugin action invoke sessionizer.worktree-close` opens the picker with one row per worktree workspace.
2. Non-worktree workspaces are excluded.
3. The currently-focused workspace, if it is a worktree workspace, appears in the picker and either succeeds or surfaces as a row failure.
4. `Tab` + `Enter` removes all marked worktrees and their git checkouts.
5. The preview pane renders label, summary, branch, repo name, cwd, last commit, and dirty status for the highlighted row.
6. Per-row failures do not abort the batch; the summary line and exit code reflect them.
7. Empty list exits 0 with a hint pointing at `sessionizer.worktree-open`.
8. No new required config keys. Existing `config.toml` files work unchanged.
9. README documents the new action and a suggested keybinding, matching the table style already used for `sessionizer.open` and `sessionizer.worktree-open`.
10. The existing `sessionizer.open` picker preview continues to work (regression check, since `workspaceRow` was extracted and its column count changed).

## Open questions / future work

- **CLI companion.** Whether to also expose `--close` (and a batch form like `--close --workspace ID [...]`) on `herdr-worktree` for shell-driven cleanup. Deferred from this iteration; can be added later against the same `runWorktreeClose` core.
- **Orphaned worktrees.** A future picker could enumerate `git worktree list --porcelain` across `projects.roots` and surface worktrees that have no open Herdr workspace. Distinct feature, separate PRD.
- **Auto-force.** A `worktree.close.force` config flag could opt in to passing `--force` to `herdr worktree remove` for dirty worktrees. Deliberately not in this iteration.
- **Re-bootstrap on reopen.** If a worktree was closed and a fresh checkout of the same branch is opened, ADR-0001 says reopened workspaces are not re-bootstrapped. That stays correct. This PRD does not change ADR-0001.

## Migration / compatibility

- The new action and pane are additive. No existing config keys change.
- The new action id is namespaced (`sessionizer.worktree-close`) and does not collide with any existing action.
- No CLI flag is added to `herdr-worktree`, so its existing flag parsing is unaffected.
- The internal row format gains a `repo_name` column. The format is internal to this plugin (it is built inside `workspaceRow` and parsed by `extractWorkspaceId`), so no external compatibility is affected. The `sessionizer.open` picker is the only other consumer and is updated in the same change.
