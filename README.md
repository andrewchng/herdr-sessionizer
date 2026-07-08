# Sessionizer

Sessionizer is a [Herdr](https://herdr.dev/) plugin that uses fuzzy pickers to open projects and Git worktrees into configured workspaces.

![Sessionizer demo — fuzzy workspace picker with README preview](docs/assets/demo.gif)

- **Sessionizer** — focus an existing workspace or create a new project workspace
- **Worktree** — create or reopen a Git worktree workspace

> **Platform:** macOS only for now. Tested on macOS; Linux support is planned.

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

- macOS (Linux planned; not validated yet)
- [Herdr](https://herdr.dev/) `>= 0.7.0`
- [Bun](https://bun.sh/) — plugin build and runtime
- [fzf](https://github.com/junegunn/fzf) — interactive pickers

```sh
curl -fsSL https://bun.com/install | bash
brew install fzf
```

Optional: [bat](https://github.com/sharkdp/bat) for richer `README.md` previews (`brew install bat`).

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

UX flow:

```text
Sessionizer:  workspaces ──Enter──> focus
              workspaces ──Esc──> projects ──Enter──> new workspace + layout

Worktree:     projects ──> branches ──Enter──> reopen (existing) or create (+ layout if new)
              branches ──Esc / none ──────────> type new branch → create + layout
```

Enter on something that already exists only focuses it — layout is not reapplied.

### Example keybindings

Add these to your Herdr config, for example:

```text
~/.config/herdr/config.toml
```

```toml
[[keys.command]]
key = "prefix+f"
type = "plugin_action"
command = "sessionizer.open"
description = "open project workspace"

[[keys.command]]
key = "prefix+up"
type = "plugin_action"
command = "sessionizer.worktree-open"
description = "open worktree workspace"
```

**Sessionizer** — workspace picker first; Esc falls through to projects under `projects.roots`.

**Worktree** — repo picker first, then branches/worktrees when any exist:

| Selection                   | Result                                            |
| --------------------------- | ------------------------------------------------- |
| Existing workspace/checkout | Reopen as-is                                      |
| Local branch                | Create a worktree workspace for that branch       |
| Remote branch               | Create a local worktree from that remote branch   |
| <kbd>Esc</kbd> / no choices | Prompt for a new branch, then create the worktree |

## Layout configuration

When Sessionizer **creates** a new project or worktree workspace, it applies the layout from `config.toml`. Existing workspaces are only focused — the layout is not reapplied.

```text
~/.config/herdr/plugins/config/sessionizer/config.toml
```

Created automatically on first run if missing.

If you want an agent to help edit either the global config or a repo-local override, see [Agent skill](#agent-skill).

### Glob roots (ghq-style layouts)

`roots` entries can be **globs**, not just plain folders. Useful when clones follow the [ghq](https://github.com/motemen/ghq) layout — host, then owner, then repo — and you do not want to list every owner by hand:

```text
~/Projects/github.com/andrewchng/herdr-sessionizer
                 └── host ── owner ── repo
```

```toml
[projects]
roots = [
  "~/Projects/github.com/*",       # every owner under github.com
  "~/Projects/aur.archlinux.org",  # plain path when repos sit flat under the host
]
git_only = true
depth = 1
```

`~/Projects/github.com/*` expands to each owner folder at picker time; with `git_only = true` and `depth = 1`, the pickers list repos inside those owners. Plain paths still work for flat layouts. See the field reference below for `**` and other forms.

### Example layout

```toml
[projects]
roots = ["~/Projects/github.com/*", "~/Workspace"]
git_only = true
depth = 1

[layout]
placement = "overlay"
focus = "editor"

[tabs.dev]
label = "dev"

[[tabs.dev.panes]]
id = "editor"
title = "nvim"
command = "nvim"

[[tabs.dev.panes]]
id = "agent"
from = "editor"
title = "agent"
split = "right"
ratio = 0.3
command = "opencode"

[[tabs.dev.panes]]
id = "git"
from = "editor"
title = "lazygit"
split = "down"
command = "lazygit"

[tabs.server]
label = "server"

[[tabs.server.panes]]
id = "server"
title = "server"
command = "npm run dev"
```

First tab shape:

```text
              dev
┌────────────────┬───────┐
│                │ agent │
│      nvim      │       │
├────────────────┤       │
│    lazygit     │       │
└────────────────┴───────┘
```

These diagrams show pane **titles**, not commands. Here, `ratio = 0.3` gives the new right-side `agent` pane 30% of the split width, leaving the `editor` side with the remaining 70%.

Second tab shape:

```text
   server
┌──────────────┐
│              │
│    server    │
│              │
└──────────────┘
```

- `[projects].roots` — parent folders or glob expressions scanned by both pickers (supports `*` and `**`; globs expand at use-time)
- `[projects].git_only` — `true` returns only directories with `.git` metadata; `false` lists all immediate child folders
- `[projects].depth` — maximum levels below each root to scan when `git_only = true`; `1` means immediate children
- `[layout].placement` — how plugin panes open (`overlay` or `split`)
- `[layout].focus` — which tab or pane to focus after layout bootstrap
- `[tabs.<name>]` — one Herdr tab to create per section
- `[[tabs.<name>.panes]]` — panes inside the tab; `from` + `split` (`right` or `down`) define the split tree
- `ratio` — optional share for the newly created pane on the split axis
- `command` — exact command a pane runs (`nvim`, `pi`, `claude`, `opencode`, etc.)

Rules for `ratio`:

- only split-created panes may set it; the first/root pane in a tab cannot
- it must be a number greater than `0` and less than `1`
- it is local to that split at creation time, not a percentage of the whole tab
- if omitted, Herdr's default split sizing is used
- it applies only when the workspace is first bootstrapped, never when an existing workspace is reopened

### Per-repo layout overrides

A repository can override the layout for **new** workspace bootstrap. Put a repo-local layout config at:

```text
<project>/.sessionizer/config.toml
```

When Sessionizer or Worktree creates a new workspace at `cwd`, Sessionizer checks in this order:

1. `<cwd>/.sessionizer/config.toml` — if present, use its `[layout].focus` and `[tabs.*]` (full replacement; no merge with global tabs)
2. Global `config.toml` — default layout

`[projects].roots` and `[layout].placement` always come from the global config. Repo-local files may include those sections, but they are ignored. Invalid repo-local config fails with an error that names the file path.

| Event                                       | Layout source                                        |
| ------------------------------------------- | ---------------------------------------------------- |
| Sessionizer creates a new project workspace | Repo override at picked `cwd`, else global default   |
| Worktree creates a new workspace            | Repo override at checkout `cwd`, else global default |
| Focus or reopen an existing workspace       | No relayout                                          |

#### Example repo override

A docs repo might skip the global `nvim + agent + lazygit` layout and open lazygit with an agent instead:

```toml
# my-docs-repo/.sessionizer/config.toml
[layout]
focus = "docs"

[tabs.docs]
label = "docs"

[[tabs.docs.panes]]
id = "git"
title = "lazygit"
command = "lazygit"

[[tabs.docs.panes]]
id = "agent"
from = "git"
title = "agent"
split = "right"
ratio = 0.3
command = "pi"
```

```text
             docs
┌────────────────┬───────┐
│                │ agent │
│    lazygit     │       │
│                │       │
└────────────────┴───────┘
```

Check `.sessionizer/config.toml` into the repo if you want the layout to travel with the project. Repos without it keep the global default.

## Agent skill

This repo also ships a `sessionizer-layout-editor` skill for agents that support the `skills` ecosystem. It helps agents update:

- global Sessionizer config
- `projects.roots`
- repo-local `.sessionizer/config.toml` overrides

Install it from this repo:

```sh
npx skills add andrewchng/herdr-sessionizer --skill sessionizer-layout-editor
```

List available skills in this repo:

```sh
npx skills add andrewchng/herdr-sessionizer --list
```

Example requests:

- "Add `~/Projects/github.com/*` to my Sessionizer project roots"
- "Add `~/Work` to my Sessionizer project roots"
- "Create a repo-local override for this repo with `lazygit` on the left and `copilot` on the right"
- "Update my global Sessionizer layout to focus the git pane"

## Development

See [CHANGELOG.md](CHANGELOG.md) for release history.

```sh
bun run typecheck
bun run test
bun run release -- 0.2.1 --dry-run
bun run release:tag -- 0.2.1 --dry-run
bun run release:notes -- 0.2.1
bun run sessionizer
```

Use `bun run release -- <version>` on the release-prep branch to update version files, then run `bun run release:tag -- <version>` from merged `main` to create and push the annotated `v<version>` release tag.
