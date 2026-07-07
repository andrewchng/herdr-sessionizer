---
name: sessionizer-layout-editor
description: Sessionizer config edits. Use when the user wants project roots, git_only, or depth; global tabs, panes, focus, or split ratios; or a repo-local .sessionizer override.
---

# Sessionizer Layout Editor

**Scope** — pick the target before editing:

| Target     | Path                                                     |
| ---------- | -------------------------------------------------------- |
| global     | `~/.config/herdr/plugins/config/sessionizer/config.toml` |
| repo-local | `<repo>/.sessionizer/config.toml`                        |

**Bootstrap** — layout changes apply only when Sessionizer or Worktree creates a **new** workspace, not on reopen.

## Workflow

1. Read the existing target file if present.
2. Enforce **scope**:
   - **repo-local**: `[layout].focus` and `[tabs.*]` only — no `[projects]`, no `[layout].placement`; tabs fully replace global (no merge)
   - **global**: `[projects]`, `[layout]`, and tabs/panes
3. Build or edit layout:
   - `[layout].focus` required
   - `[tabs.<name>]` with `label` and `[[tabs.<name>.panes]]`
   - first pane: no `from`; later panes: `from` + `split` (`right` or `down`); optional `ratio` in `(0, 1)` on the split axis
   - pane ids unique per tab; `focus` must name an existing tab or pane
4. **Discovery** edits (global only): follow [references/discovery.md](references/discovery.md)
5. Minimal diff — change only what the user asked for; stay in the chosen **scope**
6. Done when: TOML is valid, scope rules hold, and you summarized the layout plus the **bootstrap** reminder

## Examples

- "Add `~/Work` to my project roots" → global `[projects].roots`
- "Set `git_only = false`" → global discovery; see reference
- "Add a repo-local override with lazygit + copilot" → repo-local file
- "Make the right pane 30% with `ratio = 0.3`" → layout pane edit in the active **scope**

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

For global layout edits, preserve the existing `[projects]` section unless discovery is in **scope**.
