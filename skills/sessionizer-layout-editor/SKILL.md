---
name: sessionizer-layout-editor
description: Sessionizer config edits. Use when the user wants project roots, git_only, or depth; global tabs, panes, focus, or split ratios; picker [ui].placement (overlay|split|popup) or size; or a repo-local .sessionizer override.
---

# Sessionizer Layout Editor

**Scope** — pick the target before editing:

| Target     | Path                                                     |
| ---------- | -------------------------------------------------------- |
| global     | `~/.config/herdr/plugins/config/sessionizer/config.toml` |
| repo-local | `<repo>/.sessionizer/config.toml`                        |

**Bootstrap** — layout changes (`[layout].focus`, `[tabs.*]`) apply when Sessionizer or Worktree creates a **new** workspace, or when it opens an existing worktree checkout (not when an existing Herdr workspace is only focused). **Picker UI** (`[ui]`) applies every time a picker opens and is global-only.

## Workflow

1. Read the existing target file if present.
2. Enforce **scope**:
   - **repo-local**: `[layout].focus` and `[tabs.*]` only — no `[projects]`, no `[ui]`; tabs fully replace global (no merge)
   - **global**: `[projects]`, `[ui]`, `[layout]`, and tabs/panes
3. Build or edit layout:
   - `[layout].focus` required when tabs exist
   - `[tabs.<name>]` with `label` and `[[tabs.<name>.panes]]`
   - first pane: no `from`; later panes: `from` + `split` (`right` or `down`); optional `ratio` in `(0, 1)` on the split axis
   - pane ids unique per tab; `focus` must name an existing tab or pane
4. **Picker UI** edits (global only):
   - `[ui].placement` is `overlay` | `split` | `popup` (popup needs Herdr `>= 0.7.4`)
   - optional `[ui].width` / `[ui].height` only with `popup` (cells or `"80%"`)
   - **do not** put placement under `[layout]`
   - if the file still has legacy `[layout].placement`, **move it to `[ui].placement` and remove the old key** (no dual-write)
   - new seeded configs default to `placement = "overlay"`; omitted `[ui]` also falls back to `overlay` at runtime
5. **Discovery** edits (global only): follow [references/discovery.md](references/discovery.md)
6. Minimal diff — change only what the user asked for; stay in the chosen **scope**. When editing global layout or discovery, **preserve existing `[ui]`** (and `[projects]` for layout edits) unless the user asked to change them.
7. Done when: TOML is valid, scope rules hold, and you summarized the layout/UI change plus the **bootstrap** reminder when layout tabs changed

## Examples

- "Add `~/Work` to my project roots" → global `[projects].roots`
- "Add `~/Projects/github.com/*` to my project roots" → global `[projects].roots`; globs expand at use-time — see reference
- "Set `git_only = false`" → global discovery; see reference
- "Open pickers as a popup" → global `[ui].placement = "popup"` (optional width/height; default size is Herdr half-size if omitted)
- "Use a large popup" → `placement = "popup"`, `width = "90%"`, `height = "90%"`
- "Add a repo-local override with lazygit + copilot" → repo-local file
- "Make the right pane 30% with `ratio = 0.3`" → layout pane edit in the active **scope**

## Global `[ui]` snippet

```toml
[ui]
placement = "popup"   # overlay | split | popup; seeded default is overlay
width = "90%"
height = "90%"
```

## Repo-local template

```toml
[layout]
focus = "primary"

[tabs.repo]
label = "repo"

[[tabs.repo.panes]]
id = "primary"
title = "primary"
command = "some command"

[[tabs.repo.panes]]
id = "agent"
from = "primary"
title = "agent"
split = "right"
command = "copilot"
```

For global layout edits, preserve the existing `[projects]` and `[ui]` sections unless those are in **scope**.
