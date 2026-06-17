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

## Product rules

1. Existing Sessionizer workspaces are focused, not recreated.
2. Existing worktree workspaces are reopened as-is, not re-laid out.
3. Only newly created workspaces receive layout bootstrap.
4. Runtime behavior follows the config literally; it should not invent tabs, panes, or commands beyond the config file.
