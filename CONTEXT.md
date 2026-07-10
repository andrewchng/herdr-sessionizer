# Context

## Domain terms

### Sessionizer

The interactive Herdr plugin workflow that helps the user either focus an existing workspace or create a new project workspace and apply the configured layout.

### Worktree flow

The interactive or scripted workflow that creates or reopens a Git worktree workspace. Existing worktree workspaces reopen as-is. Only newly created worktree workspaces get the configured layout applied.

### Workspace

A Herdr workspace. This is the top-level unit Sessionizer focuses or creates. A workspace can contain multiple tabs and panes, and may or may not correspond to a Git worktree.

### Worktree

A Git worktree checkout. In this repo, a worktree may be represented inside Herdr as a workspace with worktree provenance metadata.

### Layout

The configured tab and pane structure Sessionizer applies to a newly created workspace. Layout application includes tab creation, pane splits, pane titles, pane commands, and final focus selection.

### Tab

A Herdr tab inside a workspace. Tabs are configured in `[tabs.<name>]`.

### Pane

A Herdr pane inside a tab. Panes are configured in `[[tabs.<name>.panes]]` and may split from earlier panes using `id` and `from`.

### Bootstrap

Applying the configured layout to a newly created workspace. This is create-time behavior only. Reopened existing workspaces should not be bootstrapped again.

### Command context

Optional text passed into pane commands that know how to consume it, such as `kiro-cli`.

### Candidate

A single pickable entry in the Sessionizer picker. A candidate is either an open workspace (focus on select) or a directory (create a workspace + apply layout on select). Encoded as a tab-delimited row for `fzf` and decoded back on selection.

### Source

Where a candidate comes from. Directory sources are `recent` (frecency), `current` (siblings + children of the launch cwd), `root` (configured `projects.roots`), and `find` (deep filesystem search). Open workspaces are the `open` source. The default view merges `open → recent → current → root`, which is also the dedup priority.

### Frecency

Recency + frequency ranking for the `recent` source. Backed by zoxide when installed (reads `zoxide query --list --score`, records opens via `zoxide add`); otherwise a built-in JSON store with zoxide-style tiered recency weighting.

### Find mode

The in-picker deep search toggled with `ctrl-f`. Runs `fd` (or `find`) over `[find].roots` up to `[find].depth`, surfacing arbitrary folders across the machine.

### Current folder

The directory the picker was launched from, resolved from the focused workspace's cwd (passed as `SESSIONIZER_CWD`) with a `process.cwd()` fallback. Its siblings and children feed the `current` source.

## Product rules

1. Existing Sessionizer workspaces are focused, not recreated.
2. Existing worktree workspaces are reopened as-is, not re-laid out.
3. `sessionizer.open` creates a plain terminal workspace at the selected folder — no layout. Layout bootstrap happens only for newly created workspaces via `sessionizer.open-layout` (the `SESSIONIZER_APPLY_LAYOUT` flag) or the worktree flow.
4. Runtime behavior follows the config literally; it should not invent tabs, panes, or commands beyond the config file.
