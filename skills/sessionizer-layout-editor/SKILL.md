---
name: sessionizer-layout-editor
description: Creates or updates Sessionizer configs in either the global plugin config or a repo-local `.sessionizer/config.toml`, depending on the user's request. Use when the user asks to add or change Sessionizer project roots, tabs, panes, focus, split direction, pane commands, or repo-local overrides.
---

# Sessionizer Layout Editor

## Quick start

Use this skill when the user wants either a global Sessionizer layout change or a repo-specific override, for example:

- "Add a `.sessionizer` override for this repo"
- "Update my global Sessionizer layout"
- "Add `~/Work` to my Sessionizer project roots"
- "Make the first pane run `lazygit` and split `copilot` on the right"
- "Change this repo's layout without touching my global config"

## Workflow

1. Identify the target scope before editing anything:
   - global config: `~/.config/herdr/plugins/config/sessionizer/config.toml`
   - repo-local override: `<repo>/.sessionizer/config.toml`
2. Read the existing target file if present.
3. Apply the correct rules for that scope:
   - repo-local overrides only define layout data for new workspaces
   - repo-local overrides live at `<repo>/.sessionizer/config.toml`
   - repo-local overrides should not add `[projects].roots` or `[layout].placement`
   - repo-local tabs fully replace the global tabs for that repo; there is no merge
   - global config may define `[projects]`, `[layout].placement`, `[layout].focus`, and tabs/panes
   - only the global config may add or edit `[projects].roots`
4. Build or edit the layout with valid Sessionizer structure:
   - include `[layout]` with `focus`
   - define one or more `[tabs.<name>]` sections with `label`
   - define panes with `[[tabs.<name>.panes]]`
   - the first pane in a tab must not use `from`
   - later panes may split from an earlier pane with `from` and `split = "right"` or `split = "down"`
   - keep pane ids unique within the tab
   - set `focus` to a pane id or tab target that exists
5. Prefer minimal edits:
   - create the target file only when needed
   - update only the requested scope
   - do not switch between global and repo-local files unless the user explicitly asks
   - when editing `[projects].roots`, preserve existing roots and add or remove only the requested paths
6. After editing, summarize the resulting layout in plain language and remind that only newly created workspaces use the override.

## Scope reminders

- **Global config** affects the default layout for new workspaces across repos.
- **Global config** is where `projects.roots` lives.
- **Repo-local override** affects only that repo and only for newly created workspaces.

## Output shape

For a simple repo-local two-pane override, prefer this pattern:

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

For a simple global layout edit, preserve any existing `[projects]` section and update only the requested layout sections.

If the user asks to add a project path, edit the global config and update `[projects].roots` instead of creating a repo-local override.
