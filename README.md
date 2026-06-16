# Sessionizer

Herdr plugin and companion CLI for opening project workspaces with a consistent tab and pane layout.

It currently supports two main workflows:

- **Sessionizer**: open or create a project workspace from an interactive picker
- **Worktree**: create or reopen a Git worktree workspace, either interactively or from a scripted CLI

> [!IMPORTANT]
> Interactive flows belong in Herdr-managed plugin panes. For scripted worktree automation, use the standalone `herdr-worktree` Bun-linked CLI.

## What this package provides

| Surface | Entry | Use case |
| --- | --- | --- |
| Plugin action | `sessionizer.open` | Open the interactive sessionizer pane |
| Plugin action | `sessionizer.worktree-open` | Open the interactive worktree pane |
| Plugin pane | `sessionizer` | Interactive project picker and workspace bootstrap |
| Plugin pane | `worktree` | Interactive worktree flow |
| Bun bin | `herdr-worktree` | Scripted/headless worktree flow with `--project` and `--branch` |

## Requirements

- [Herdr](https://herdr.dev/) `>= 0.7.0`
- [Bun](https://bun.sh/)
- `fzf` for the interactive picker flows

## Local development setup

Install dependencies:

```sh
bun install
```

Link the Herdr plugin:

```sh
herdr plugin link /Users/mac/dotfiles/herdr-plugins/sessionizer
```

Link the standalone `herdr-worktree` CLI:

```sh
cd /Users/mac/dotfiles/herdr-plugins/sessionizer
bun link
```

> [!NOTE]
> `bun link` makes the local package behave like a globally installed CLI package. In this repo, it exposes the `herdr-worktree` command from `src/bin/herdr-worktree.ts`.

When plugin manifest or pane/action code changes, relink the plugin:

```sh
herdr plugin unlink sessionizer || true
herdr plugin link /Users/mac/dotfiles/herdr-plugins/sessionizer
```

When the standalone bin wiring changes, refresh the CLI link:

```sh
cd /Users/mac/dotfiles/herdr-plugins/sessionizer
bun link
```

## Usage

### Interactive sessionizer

Open the plugin pane directly:

```sh
herdr plugin action invoke sessionizer.open
```

Or use the configured keybinding:

```text
Ctrl-a f
```

### Interactive worktree

Open the worktree pane:

```sh
herdr plugin action invoke sessionizer.worktree-open
```

Or use the configured keybinding:

```text
Ctrl-a Shift-u
```

### Scripted worktree CLI

Run the standalone CLI directly:

```sh
herdr-worktree --project ~/Projects/my-repo --branch feat/new-flow
```

Pass context through to the configured agent pane:

```sh
herdr-worktree \
  --project ~/Projects/my-repo \
  --branch feat/new-flow \
  --context "Fix the failing form validation and summarize changes"
```

Run the interactive worktree flow from the package without linking:

```sh
cd /Users/mac/dotfiles/herdr-plugins/sessionizer
bun run worktree
```

> [!TIP]
> `herdr-worktree` keeps the old command name, but now runs the new migrated implementation from this package.

## Configuration

The plugin and the standalone `herdr-worktree` CLI share the same config file:

```text
~/.config/herdr/plugins/config/sessionizer/config.toml
```

If the file does not exist yet, the plugin creates it automatically on first run.

### Config shape

```toml
[agents]
default = "opencode"

[projects]
roots = ["~/"]

[layout]
placement = "overlay"
focus = "agent"

[tabs.terminal]
label = "terminal"

[[tabs.terminal.panes]]
title = "shell"
command = ""

[[tabs.terminal.panes]]
title = "agent"
split = "right"
agent = true

[tabs.editor]
enabled = true
label = "editor"

[[tabs.editor.panes]]
title = "editor"
command = "nvim"

[tabs.server]
enabled = true
label = "server"

[[tabs.server.panes]]
title = "server"
command = ""
```

### Config notes

- `projects.roots` controls which directories are searched for the first interactive picker
- `layout.placement` controls how plugin panes open: `overlay`, `split`, `tab`, or `zoomed`
- `layout.focus` chooses which tab or pane should be focused after workspace setup
- `[[tabs.<name>.panes]]` supports multiple panes per tab
- `agent = true` launches the configured agent command in that pane
- worktree server panes can interpolate `{branch}` in commands

## Keybindings

Current Herdr bindings in this repo:

| Key | Command | Purpose |
| --- | --- | --- |
| `Ctrl-a f` | `sessionizer.open` | Project sessionizer |
| `Ctrl-a Shift-u` | `sessionizer.worktree-open` | Interactive worktree flow |

## Development

Useful commands:

```sh
bun run typecheck
bun run sessionizer
bun run worktree --help
```

## Current workflow guidance

Use the plugin for interactive flows and the standalone CLI for scripted worktree automation:

- **interactive project picker** -> `sessionizer.open`
- **interactive worktree picker/prompt** -> `sessionizer.worktree-open`
- **scripted worktree creation/opening** -> `herdr-worktree --project ... --branch ...`

That split matches Herdr's current CLI model well: panes are a good fit for TTY UI, while `bun link` gives the worktree flow a stable command for shell automation.
