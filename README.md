# Sessionizer

Herdr plugin for opening project workspaces with a consistent tab and pane layout, with an optional companion CLI for scripted worktree flows.

It currently supports two primary interactive workflows:

- **Sessionizer**: open or create a project workspace from an interactive picker
- **Worktree**: create or reopen a Git worktree workspace from an interactive picker

> [!IMPORTANT]
> The primary use case is interactive plugin-driven workflow through Herdr panes. The standalone `herdr-worktree` CLI is optional and mainly useful for scripted worktree automation.

## What this package provides

| Surface | Entry | Use case |
| --- | --- | --- |
| Plugin action | `sessionizer.open` | Open the interactive sessionizer pane |
| Plugin action | `sessionizer.worktree-open` | Open the interactive worktree pane |
| Plugin pane | `sessionizer` | Interactive project picker and workspace bootstrap |
| Plugin pane | `worktree` | Interactive worktree flow |
| Bun bin | `herdr-worktree` | Optional scripted worktree flow with `--project` and `--branch` |

## Requirements

- [Herdr](https://herdr.dev/) `>= 0.7.0`
- [Bun](https://bun.sh/)

## Optional dependencies

- [fzf](https://github.com/junegunn/fzf) for the interactive picker flows
- [bat](https://github.com/sharkdp/bat) for richer `README.md` previews in the picker UI

## Setup

### Install from GitHub

Install the plugin directly with Herdr:

```sh
herdr plugin install andrewchng/herdr-sessionizer --yes
```

Open the plugin after install:

```sh
herdr plugin action invoke sessionizer.open
```

Find the plugin config directory:

```sh
herdr plugin config-dir sessionizer
```

> [!NOTE]
> This is the main setup path. It gives you the Herdr plugin surfaces directly from GitHub.

### Local development setup

Install dependencies:

```sh
bun install
```

Link the Herdr plugin:

```sh
herdr plugin link /path/to/herdr-sessionizer
```

When plugin manifest or pane/action code changes, relink the plugin:

```sh
herdr plugin unlink sessionizer || true
herdr plugin link /path/to/herdr-sessionizer
```

## Usage

### Interactive sessionizer

Open the plugin pane directly:

```sh
herdr plugin action invoke sessionizer.open
```

Or use a keybinding you wire to `sessionizer.open` in your own Herdr config.

What it does:

- first shows an `fzf` picker of existing Herdr workspaces plus projects found under `projects.roots`
- if you pick an existing workspace, Sessionizer focuses it
- if you pick a project path, Sessionizer creates a new workspace for that project and applies the configured tab and pane layout
- the layout can create terminal, editor, server, and extra custom tabs with named panes

What the picker contains:

- existing Herdr workspaces
- repo folders discovered under your configured `projects.roots`

### Interactive worktree

Open the worktree pane:

```sh
herdr plugin action invoke sessionizer.worktree-open
```

Or use a keybinding you wire to `sessionizer.worktree-open` in your own Herdr config.

What it does:

- shows an `fzf` picker of base project repositories found under `projects.roots`
- after you pick a base repo, prompts for a branch name
- if that worktree already exists, it reopens the matching workspace or checkout
- if it does not exist yet, it creates the worktree, opens it as a Herdr workspace, and applies the configured tab and pane layout

What the picker contains:

- base project repositories, not existing worktree branches

What happens after the branch prompt:

- existing branch/worktree -> reopen and optionally bootstrap the layout if the workspace is still bare
- new branch/worktree -> create, open, and bootstrap the layout

## Configuration

The plugin and the standalone `herdr-worktree` CLI share the same config file:

```text
~/.config/herdr/plugins/config/sessionizer/config.toml
```

If the file does not exist yet, the plugin creates it automatically on first run.

At runtime, the plugin reads this file literally. It does not invent extra tabs, panes, or commands beyond what is in your config.

### Minimal example

```toml
[projects]
# Parent folders searched by the interactive pickers
roots = ["~/Projects", "~/Workspace"]

[layout]
# How the plugin pane itself opens: overlay | split
placement = "overlay"
# Which pane or tab to focus after layout creation
focus = "assistant"

[tabs.terminal]
# Create this tab
enabled = true
label = "terminal"

[[tabs.terminal.panes]]
# Root pane in this tab
id = "shell"
title = "shell"
command = ""

[[tabs.terminal.panes]]
# Split from shell and run another command
id = "assistant"
from = "shell"
title = "assistant"
split = "right"
command = "opencode"
```

What this means:

- `command` is the exact command that pane should run
- `enabled = true` means that tab should be created
- if a tab has `enabled = false`, Sessionizer skips creating it
- common assistant/tool command examples include `pi`, `claude`, `copilot`, and `opencode`

### Anchored split example

```toml
[tabs.layout_test]
enabled = true
label = "layout-test"

[[tabs.layout_test.panes]]
# First pane becomes the root/anchor for later splits
id = "top-left"
title = "top-left"
command = ""

[[tabs.layout_test.panes]]
# Split to the right of top-left
id = "top-right"
title = "top-right"
from = "top-left"
split = "right"
command = "git status --short"

[[tabs.layout_test.panes]]
# Split below top-left
id = "bottom-left"
title = "bottom-left"
from = "top-left"
split = "down"
command = "pwd"

[[tabs.layout_test.panes]]
# Split below top-right
id = "bottom-right"
title = "bottom-right"
from = "top-right"
split = "down"
command = "ls"
```

### Config notes

- `projects.roots` controls which directories are searched for the first interactive picker
- use a short list of parent folders that contain your repos, for example `~/Projects` or `~/Workspace`
- `command` is the exact command a pane should run, for example `nvim`, `pi`, `claude`, `copilot`, or `opencode`
- `layout.placement` controls how plugin panes open: `overlay` or `split`
- `layout.focus` chooses which tab or pane should be focused after workspace setup
- `tabs` are created exactly from the `[tabs.<name>]` sections you define
- `enabled` controls whether a tab is created at all
- `[[tabs.<name>.panes]]` supports multiple panes per tab
- `id` gives a pane a stable name that other panes can split from
- `from` tells a pane which earlier pane in the same tab to split from
- `split` currently supports only `right` and `down`
- each tab must define at least one `[[tabs.<name>.panes]]` entry
- worktree server panes can interpolate `{branch}` in commands

## Example keybindings

This plugin does not require a specific prefix or shortcut. Bind the plugin actions however you want in your own Herdr config.

Example bindings:

| Key | Command | Purpose |
| --- | --- | --- |
| `Prefix f` | `sessionizer.open` | Project sessionizer |
| `Prefix Shift-u` | `sessionizer.worktree-open` | Interactive worktree flow |

Example `config.toml` entries:

```toml
[[keys.command]]
key = "prefix+f"
type = "plugin_action"
command = "sessionizer.open"
description = "project sessionizer"

[[keys.command]]
key = "prefix+shift+u"
type = "plugin_action"
command = "sessionizer.worktree-open"
description = "create worktree workspace"
```

## Development

Useful commands:

```sh
bun run typecheck
bun run sessionizer
bun run worktree --help
```

## Optional standalone worktree CLI

The standalone `herdr-worktree` command is available for scripting, but it is not the primary plugin workflow.

Link it locally with Bun:

```sh
cd /path/to/herdr-sessionizer
bun link
```

Run it directly:

```sh
herdr-worktree --project ~/Projects/my-repo --branch feat/new-flow
```

Pass context through to the configured assistant/tool pane command:

```sh
herdr-worktree \
  --project ~/Projects/my-repo \
  --branch feat/new-flow \
  --context "Fix the failing form validation and summarize changes"
```

Without linking, you can still run it from a checkout:

```sh
cd /path/to/herdr-sessionizer
bun run worktree --project ~/Projects/my-repo --branch feat/new-flow
```

> [!TIP]
> `bun link` makes the local package behave like a globally installed CLI package. In this repo, it exposes the `herdr-worktree` command from `src/bin/herdr-worktree.ts`.

## Current workflow guidance

Use the plugin first, and reach for the standalone CLI only when you want shell-driven worktree automation:

- **interactive project picker** -> `sessionizer.open`
- **interactive worktree picker/prompt** -> `sessionizer.worktree-open`
- **scripted worktree creation/opening** -> `herdr-worktree --project ... --branch ...`

That split matches Herdr's current CLI model well: panes are a good fit for TTY UI, while `bun link` gives the worktree flow a stable command for shell automation.
