# Sessionizer

Sessionizer is a [Herdr](https://herdr.dev/) plugin that uses fuzzy pickers to open projects and Git worktrees into configured workspaces.

![Sessionizer demo — fuzzy workspace picker with README preview](docs/assets/demo.gif)

- **Sessionizer** — one fuzzy picker that merges open workspaces, frecency-ranked directories, current-folder neighbours, and configured project roots, with an in-picker "find" toggle to search the whole machine
- **Worktree** — create or reopen a Git worktree workspace

> **Platform:** macOS only for now. Tested on macOS; Linux support is planned.

## Inspiration

Inspired by [ThePrimeagen's tmux-sessionizer](https://github.com/ThePrimeagen/tmux-sessionizer) and [sesh](https://github.com/joshmedeski/sesh): fuzzy-find a project, land in the right dev environment — but for Herdr workspaces instead of tmux sessions.

| [sesh](https://github.com/joshmedeski/sesh) | Sessionizer                                         |
| ------------------------------------------- | --------------------------------------------------- |
| merges tmux sessions + zoxide + config      | merges open workspaces + frecency + current + roots |
| `zoxide` frecency                           | `zoxide` frecency (built-in store fallback)         |
| `ctrl-f` → `fd` find                        | `ctrl-f` → `fd` find                                |
| tmux session                                | Herdr workspace                                     |
| tmux windows/panes                          | Sessionizer tab/pane layout                         |

## Requirements

Sessionizer does not install system tools for you.

- [Herdr](https://herdr.dev/) `>= 0.7.0`
- [Bun](https://bun.sh/) — plugin build and runtime
- [fzf](https://github.com/junegunn/fzf) — interactive pickers

```sh
curl -fsSL https://bun.com/install | bash
brew install fzf
```

Optional but recommended:

- [zoxide](https://github.com/ajeetdsouza/zoxide) — powers the frecency ("recent") source. Without it, Sessionizer uses a built-in store that starts empty (`brew install zoxide`).
- [fd](https://github.com/sharkdp/fd) — powers the "find" deep search. Falls back to POSIX `find` when absent (`brew install fd`).
- [bat](https://github.com/sharkdp/bat) — richer `README.md` previews (`brew install bat`).

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

### UX flow

Sessionizer opens one merged picker. Rows are either an **open workspace** (Enter → focus it) or a **directory** (Enter → create a workspace and apply the layout). Directory rows come from your frecency history, the current folder's neighbours, and your configured `projects.roots`. Press `ctrl-f` to search the whole machine.

```text
Sessionizer (one merged picker)
  open workspace  ──Enter──> focus
  directory       ──Enter──> new workspace + layout   (or focus if already open)

  ^a all   ^o open only   ^r recent only   ^f find (deep fd search)
```

| Key binding | Source shown                                                      |
| ----------- | ----------------------------------------------------------------- |
| `ctrl-a`    | all — open + recent + current folder + `projects.roots` (default) |
| `ctrl-o`    | open workspaces only                                              |
| `ctrl-r`    | recent (frecency) only                                            |
| `ctrl-f`    | find — deep `fd`/`find` search under `[find].roots`               |

```text
Worktree (always starts at repo picker)
  projects ──> branches? ──Enter──> reopen or create — see table
            └──────────── Esc / none ──> type new branch → create + layout
```

| Selection                   | Result                                            |
| --------------------------- | ------------------------------------------------- |
| Existing workspace/checkout | Reopen as-is                                      |
| Local branch                | Create a worktree workspace for that branch       |
| Remote branch               | Create a local worktree from that remote branch   |
| <kbd>Esc</kbd> / no choices | Prompt for a new branch, then create the worktree |

See [Layout configuration](#layout-configuration) for when layout is applied.

### Frecency & find

The picker ranks directories by **frecency** (frequency + recency). When [zoxide](https://github.com/ajeetdsouza/zoxide) is installed, Sessionizer reads its database (`zoxide query --list --score`) and records every directory it opens (`zoxide add`), so the ranking stays in sync with your shell `cd` history. Without zoxide, a built-in store at `${XDG_STATE_HOME:-~/.local/state}/herdr/sessionizer/frecency.json` is used instead — it starts empty and fills as you open projects.

The **current folder** source lists sibling and child directories of wherever the picker was launched from, so you can hop between nearby projects. **Find** (`ctrl-f`) deep-searches `[find].roots` (default: your home directory) up to `[find].depth` levels using `fd` — mirroring sesh's `fd -H -d 2 -t d . ~` — and falls back to POSIX `find` when `fd` is not installed.

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

## Layout configuration

When Sessionizer **creates** a new project or worktree workspace, it applies the layout from `config.toml`. Existing workspaces are only focused — the layout is not reapplied.

```text
~/.config/herdr/plugins/config/sessionizer/config.toml
```

Created automatically on first run if missing.

If you want an agent to help edit either the global config or a repo-local override, see [Agent skills](#agent-skills).

### Example layout

```toml
[projects]
roots = ["~/Projects", "~/Workspace"]
git_only = true
depth = 1

# Deep-search source (ctrl-f). Optional; shown with defaults.
[find]
roots = ["~"]
depth = 2

# Current-folder source (siblings + children). Optional; shown with defaults.
[current]
enabled = true
siblings = true
children = true

# Frecency source. Optional; shown with defaults.
[recent]
enabled = true
limit = 50

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

- `[projects].roots` — parent folders scanned for the `root` source and the worktree picker (plain paths; optional globs — see [Glob roots](#glob-roots-optional) below)
- `[projects].git_only` — `true` returns only directories with `.git` metadata; `false` lists all immediate child folders
- `[projects].depth` — maximum levels below each root to scan when `git_only = true`; `1` means immediate children
- `[find].roots` — roots the `ctrl-f` deep search scans (default `["~"]`)
- `[find].depth` — max levels below each find root (default `2`, like sesh)
- `[current].enabled` / `[current].siblings` / `[current].children` — toggle the current-folder source and whether it lists siblings and/or immediate children (all default `true`)
- `[recent].enabled` — toggle the frecency source (default `true`)
- `[recent].limit` — max frecency entries merged into the default view (default `50`)
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

### Glob roots (optional)

Globs in `roots` help when clones follow a nested layout — e.g. [ghq](https://github.com/motemen/ghq)'s `host/owner/repo` tree — and you do not want to list every owner folder:

```text
~/Projects/github.com/andrewchng/herdr-sessionizer
                 └── host ── owner ── repo
```

```toml
[projects]
roots = [
  "~/Projects/github.com/*",       # expands to each owner under github.com
  "~/Projects/aur.archlinux.org",  # plain path when repos sit flat under the host
]
git_only = true
depth = 1
```

With `git_only = true` and `depth = 1`, `~/Projects/github.com/*` lists repos inside each owner, not the owner folders themselves:

```text
~/Projects/github.com/
  andrewchng/
    herdr-sessionizer/   ← listed
    dotfiles/            ← listed
  motemen/
    ghq/                 ← listed
```

The picker shows `herdr-sessionizer`, `dotfiles`, and `ghq` — not `andrewchng` or `motemen`. Non-git folders (e.g. `not-a-repo/`) are skipped.

For recursive scans (e.g. mixed or deeply nested layouts), use `**` — `~/Projects/**` — instead of `*`.

### Per-repo layout overrides

A repository can override the layout for **new** workspace bootstrap. Put a repo-local layout config at:

```text
<project>/.sessionizer/config.toml
```

When Sessionizer or Worktree creates a new workspace at `cwd`, Sessionizer checks in this order:

1. `<cwd>/.sessionizer/config.toml` — if present, use its `[layout].focus` and `[tabs.*]` (full replacement; no merge with global tabs)
2. Global `config.toml` — default layout

`[projects]`, `[find]`, `[current]`, `[recent]`, and `[layout].placement` always come from the global config. Repo-local files may include those sections, but they are ignored. Invalid repo-local config fails with an error that names the file path.

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

## Agent skills

This repo ships skills for agents that support the `skills` ecosystem:

- **sessionizer-layout-editor** — global Sessionizer config, `projects.roots`, repo-local `.sessionizer/config.toml` overrides
- **sessionizer-gh-release** — ship a version (changelog, tag, GitHub release)

```sh
npx skills add andrewchng/herdr-sessionizer --list
npx skills add andrewchng/herdr-sessionizer --skill sessionizer-layout-editor -y -g
npx skills add andrewchng/herdr-sessionizer --skill sessionizer-gh-release -y -g
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
bun run release -- <version> --dry-run
bun run release:tag -- <version> --dry-run
bun run release:notes -- <version>
bun run sessionizer
```

Use `bun run release -- <version>` on the release-prep branch to update version files, then run `bun run release:tag -- <version>` from merged `main` to create and push the annotated `v<version>` release tag.
