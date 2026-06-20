# Sessionizer

Sessionizer is a [Herdr](https://herdr.dev/) plugin that uses fuzzy pickers to open projects and worktrees into Herdr workspaces using your configured tab and pane layout.

It currently supports two primary interactive workflows:

- **Sessionizer** — focus an existing workspace or create a new project workspace from an interactive picker
- **Worktree** — create or reopen a Git worktree workspace from an interactive picker

> [!IMPORTANT]
> The primary product is the interactive Herdr plugin. The standalone `herdr-worktree` CLI is an optional companion for scripted worktree automation, not the main workflow.

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
- [fzf](https://github.com/junegunn/fzf) for the interactive picker flows

## Optional dependencies

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
> This is the main setup path. Most users only need the plugin install and a couple of keybindings.

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
- the layout comes entirely from your config file

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
- if that worktree already exists, it reopens the matching workspace or checkout as-is
- if it does not exist yet, it creates the worktree, opens it as a Herdr workspace, and applies the configured tab and pane layout

What the picker contains:

- base project repositories, not existing worktree branches

What happens after the branch prompt:

- existing branch/worktree -> reopen the existing workspace or checkout as-is
- new branch/worktree -> create, open, and bootstrap the layout

## Configuration

The plugin and the standalone `herdr-worktree` CLI share the same config file:

```text
~/.config/herdr/plugins/config/sessionizer/config.toml
```

If the file does not exist yet, the plugin creates it automatically on first run.

At runtime, the plugin reads this file literally. It does not invent extra tabs, panes, or commands beyond what is in your config.

> [!NOTE]
> Existing workspaces are reopened as-is. Layout bootstrap only happens for newly created workspaces.

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

### Pane context (optional)

A pane can opt in to receiving a context string (for example, the `--context` flag passed to `herdr-worktree`) by adding a `command_context` field. When context is available, the plugin runs `command_context`; when it is not, the plugin falls back to `command`.

```toml
[[tabs.assistant.panes]]
id = "assistant"
title = "assistant"
command = "kiro-cli"                          # default (no context)
command_context = "kiro-cli chat {context}"  # used when --context is provided
```

Behavior matrix:

| Flow | Context available? | Runs |
| --- | --- | --- |
| Sessionizer | No | `command` |
| Worktree + `--context "..."` | Yes | `command_context` |
| Worktree (interactive, prompt skipped) | No | `command` |
| Worktree (interactive, user typed context) | Yes | `command_context` |

Placeholders:

- `{context}` — the context string. Auto shell-quoted, so spaces and shell metacharacters are safe.
- `{branch}` — the worktree branch name. Interpolated raw (no quoting). Already supported in the worktree flow.

Panes without `command_context` never receive context, even if the worktree flow has one to give.

> [!NOTE]
> The `command_context` field is a breaking change for existing `kiro-cli` configs. The old code recognized `kiro-cli` by string prefix and rewrote it to `kiro-cli chat <context>`. After this change, that implicit behavior is gone — you must declare it explicitly via `command_context = "kiro-cli chat {context}"`.

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
- `command_context` is the optional command used when a context string is available; supports `{context}` (auto-quoted) and `{branch}` (raw) placeholders
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
- only panes that declare `command_context` will receive the `--context` value from the worktree flow

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

The standalone `herdr-worktree` command is available for shell automation, but it is secondary to the interactive plugin workflow.

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
