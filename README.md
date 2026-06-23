# Sessionizer

Sessionizer is a [Herdr](https://herdr.dev/) plugin that uses fuzzy pickers to open projects and Git worktrees into configured workspaces.

- **Sessionizer** — focus an existing workspace or create a new project workspace
- **Worktree** — create or reopen a Git worktree workspace

> [!IMPORTANT]
> The interactive plugin is the main product. The standalone `herdr-worktree` CLI is optional for scripted automation.

## Inspiration

Inspired by [ThePrimeagen's tmux-sessionizer](https://github.com/ThePrimeagen/tmux-sessionizer): fuzzy-find a project, land in the right dev environment — but for Herdr workspaces instead of tmux sessions.

| [tmux-sessionizer](https://github.com/ThePrimeagen/tmux-sessionizer) | Sessionizer                    |
| -------------------------------------------------------------------- | ------------------------------ |
| `fzf` over project roots                                             | `fzf` over `projects.roots`    |
| tmux session                                                         | Herdr workspace                |
| tmux windows/panes                                                   | Sessionizer tab/pane layout    |
| tmux-only                                                            | Herdr-native + worktree picker |

## Requirements

Sessionizer does not install system tools for you.

- [Herdr](https://herdr.dev/) `>= 0.7.0`
- [Bun](https://bun.sh/) — plugin build and runtime
- [fzf](https://github.com/junegunn/fzf) — interactive pickers

```sh
curl -fsSL https://bun.com/install | bash
brew install oven-sh/bun/bun   # macOS alternative
brew install fzf               # macOS / Linux (Homebrew)
sudo apt install fzf           # Debian 9+ / Ubuntu 19.10+
sudo dnf install fzf           # Fedora
```

Optional: [bat](https://github.com/sharkdp/bat) for richer `README.md` previews (`brew install bat`, `sudo apt install bat`, `sudo dnf install bat`). On older Debian/Ubuntu the binary may be `batcat`; Sessionizer looks for `bat` on PATH.

## Setup

```sh
herdr plugin install andrewchng/herdr-sessionizer --yes
herdr plugin config-dir sessionizer
```

Wire keybindings in your Herdr config (see [Example keybindings](#example-keybindings)).

### Local development

```sh
bun install
herdr plugin link /path/to/herdr-sessionizer
```

After manifest or pane/action changes:

```sh
herdr plugin unlink sessionizer || true
herdr plugin link /path/to/herdr-sessionizer
```

## Usage

| Flow            | Action                      |
| --------------- | --------------------------- |
| Project picker  | `sessionizer.open`          |
| Worktree picker | `sessionizer.worktree-open` |

```sh
herdr plugin action invoke sessionizer.open
herdr plugin action invoke sessionizer.worktree-open
```

**Sessionizer** lists existing workspaces plus repos under `projects.roots`. Pick a workspace to focus it; pick a project to create a workspace and apply your layout.

**Worktree** lists base repos under `projects.roots`, prompts for a branch, then reopens an existing checkout or creates a new worktree workspace with your layout.

Existing workspaces are reopened as-is. Layout bootstrap runs only for newly created workspaces.

## Configuration

Shared by the plugin and optional `herdr-worktree` CLI:

```text
~/.config/herdr/plugins/config/sessionizer/config.toml
```

Created automatically on first run if missing. The plugin reads it literally — no extra tabs, panes, or commands are invented at runtime.

### Minimal example

```toml
[projects]
roots = ["~/Projects", "~/Workspace"]

[layout]
placement = "overlay"
focus = "assistant"

[tabs.terminal]
enabled = true
label = "terminal"

[[tabs.terminal.panes]]
id = "shell"
title = "shell"
command = ""

[[tabs.terminal.panes]]
id = "assistant"
from = "shell"
title = "assistant"
split = "right"
command = "opencode"
```

- `command` is the exact pane command (`nvim`, `pi`, `claude`, `opencode`, etc.)
- `enabled = false` skips a tab
- `from` + `split` (`right` or `down`) anchor splits within a tab
- worktree panes can interpolate `{branch}` in commands

### Worktree command override (optional)

One pane may set `accept_command_override = true` to receive a raw `herdr-worktree --command '...'` override. Without `--command`, it runs its normal `command`.

```toml
[[tabs.assistant.panes]]
id = "assistant"
title = "assistant"
command = "kiro-cli"
accept_command_override = true
```

`--command` is passed through as a raw shell command — not quoted or templated by the plugin.

## Example keybindings

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

## Optional `herdr-worktree` CLI

For shell automation instead of the interactive picker:

```sh
cd /path/to/herdr-sessionizer && bun link
herdr-worktree --project ~/Projects/my-repo --branch feat/new-flow
herdr-worktree --project ~/Projects/my-repo --branch feat/new-flow \
  --command 'kiro-cli chat "Fix the failing form validation"'
```

Without linking: `bun run worktree --project ... --branch ...`

## Development

```sh
bun run typecheck
bun run test
bun run sessionizer
bun run worktree --help
```
