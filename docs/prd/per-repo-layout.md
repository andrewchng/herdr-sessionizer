# PRD: Per-repo layout overrides

Status: Ready for implementation
Owner: Sessionizer plugin
Related: #12, ADR-0001, `src/config.ts`, `src/sessionizer.ts`, `src/worktree.ts`

## Summary

Today every newly created workspace uses the same global layout from the plugin config dir (`HERDR_PLUGIN_CONFIG_DIR/config.toml`). This PRD adds optional **repo-local layout overrides** at `<project>/.sessionizer/config.toml` so each repository can declare its own tabs, panes, and focus target when Sessionizer or Worktree bootstraps a **new** workspace.

Global config continues to own `[projects].roots` and `[layout].placement`. Repo-local config owns only the layout slice: `[layout].focus` and `[tabs.*]`.

## Goals

- When creating a new project or worktree workspace at `cwd`, use `<cwd>/.sessionizer/config.toml` if it exists; otherwise fall back to the global default layout.
- Reuse the existing TOML schema and `buildTabs` / `buildPanes` parsing — no new pane fields in this slice.
- Preserve bootstrap-only behavior from ADR-0001: reopening/focusing an existing workspace never reapplies layout.
- Clear errors when a repo-local file exists but is invalid (fail loud; do not silently fall back).
- Unit tests with temp dirs; manual acceptance test using the **`llm-wiki`** repo.

## Non-goals

- Per-repo `[projects].roots` overrides.
- Global `[layouts.projects.<name>]` map (can be a follow-up).
- Partial merge of repo-local + global tabs (repo file replaces the layout slice entirely).
- Relayout on workspace reopen.
- Changing `herdr-plugin.toml` or plugin manifest.

## Config resolution

### Global config (unchanged location)

```text
$HERDR_PLUGIN_CONFIG_DIR/config.toml
# default: ~/.config/herdr/plugins/config/sessionizer/config.toml
```

Required global fields (unchanged):

- `[projects].roots`
- `[layout].placement`
- `[layout].focus` and `[tabs.*]` — used as **default layout** when no repo override exists

### Repo-local override

```text
<project-cwd>/.sessionizer/config.toml
```

Allowed fields in repo-local file:

- `[layout].focus` (required when file exists)
- `[tabs.<name>]` and `[[tabs.<name>.panes]]` (at least one tab)

Ignored if present in repo-local file (read from global only):

- `[projects]`
- `[layout].placement`

### Lookup order at bootstrap time

Given `layoutCwd` (absolute project or worktree checkout path):

1. If `join(layoutCwd, '.sessionizer', 'config.toml')` exists → parse as layout override
2. Else → use `focus` + `tabs` from global `config.toml`

`projects.roots` and `layout.placement` always come from global config.

### API shape (proposed)

```ts
// src/config.ts
export interface SessionizerConfig {
  projects: { roots: string[] };
  layout: { placement: PanePlacement; focus: string };
  tabs: TabConfig[];
}

export function loadConfig(): SessionizerConfig; // global; unchanged call sites for roots

export function resolveLayoutConfig(
  layoutCwd: string,
  global?: SessionizerConfig
): Pick<SessionizerConfig, "layout" | "tabs">;
// Returns merged config: global.placement + resolved focus/tabs
```

`resolveLayoutConfig` throws with a message that includes the repo-local path on parse/validation failure.

## Integration points

### Sessionizer (`src/sessionizer.ts`)

After `workspaces.create({ cwd: project, ... })` and before `createProjectLayout`:

```ts
const layoutConfig = resolveLayoutConfig(project, config);
await runtime.createLayout(workspace, project, layoutConfig, tabs, panes);
```

`project` is already the absolute path from the picker.

### Worktree (`src/worktree.ts`)

`resolveLayoutCwd` already exists. Before each `createLayout` call (~lines 154–168), replace the static `config` with:

```ts
const layoutConfig = resolveLayoutConfig(layoutCwd, config);
await runtime.createLayout(
  workspace,
  layoutCwd,
  layoutConfig,
  tabs,
  panes,
  options
);
```

Apply on **new** worktree bootstrap paths only — not on reopen-as-is paths.

## Manual acceptance: `llm-wiki` repo

Use the maintainer's local **`llm-wiki`** repo as the end-to-end test project.

**Path:** `~/Resources/llm-wiki` (or `expandHome('~/Resources/llm-wiki')`)

### Setup (agent may create this file in llm-wiki during implementation/QA)

```toml
# ~/Resources/llm-wiki/.sessionizer/config.toml
[layout]
focus = "wiki"

[tabs.wiki]
label = "wiki"

[[tabs.wiki.panes]]
id = "git"
title = "lazygit"
command = "lazygit"

[[tabs.wiki.panes]]
id = "agent"
from = "git"
title = "agent"
split = "right"
command = "pi"
```

This layout intentionally differs from the global default (lazygit + `pi` only, no nvim, tab label `wiki`, focus `wiki`) so manual verification is obvious.

### Manual test steps

1. Ensure global `config.toml` still has the dev layout (nvim + agent + lazygit).
2. Add `.sessionizer/config.toml` to `llm-wiki` as above.
3. Pick **`llm-wiki`** via `sessionizer.open` as a **new** project (use a fresh workspace name/path, or remove any existing llm-wiki Sessionizer workspace first).
4. **Expect:** one `wiki` tab, lazygit + `pi` split, **no** nvim pane.
5. Pick a different project without `.sessionizer/` → **expect** global default layout.
6. Reopen existing llm-wiki workspace from picker → **expect** no relayout (ADR-0001).

### Commit policy for llm-wiki

- The PR for #12 may add `.sessionizer/config.toml` to `llm-wiki` in the maintainer's local clone for QA.
- Do **not** commit llm-wiki changes to the `herdr-sessionizer` repo — only document the example in README + this PRD.

## Unit tests (`src/config.test.ts` or extend existing)

| Case                                     | Expect                                                                       |
| ---------------------------------------- | ---------------------------------------------------------------------------- |
| Repo-local file exists with valid layout | `resolveLayoutConfig` returns repo `focus` + `tabs`; `placement` from global |
| Repo-local file missing                  | Global `focus` + `tabs`                                                      |
| Repo-local file invalid TOML             | Throws with path in message                                                  |
| Repo-local file missing `[layout].focus` | Throws                                                                       |
| Repo-local file missing `[tabs.*]`       | Throws                                                                       |

Use `mkdtemp` fixtures; no dependency on real `llm-wiki` path in unit tests.

## Documentation

- README: new subsection under **Layout configuration** — per-repo overrides, lookup order, example `.sessionizer/config.toml`
- Link PRD from issue #12

## Acceptance criteria

1. `resolveLayoutConfig(cwd)` implemented in `src/config.ts` with tests above.
2. `runSessionizer` uses repo override when creating a new workspace.
3. `runWorktree` uses repo override on new-bootstrap paths only.
4. Invalid repo-local config fails with a clear error naming the file path.
5. README documents `.sessionizer/config.toml`.
6. Manual QA checklist completed against local `llm-wiki` repo.

## Files to change

| File                      | Change                                                              |
| ------------------------- | ------------------------------------------------------------------- |
| `src/config.ts`           | Split layout resolution; export `resolveLayoutConfig`               |
| `src/config.test.ts`      | New tests (create if missing)                                       |
| `src/sessionizer.ts`      | Call `resolveLayoutConfig` before `createLayout`                    |
| `src/worktree.ts`         | Call `resolveLayoutConfig` before `createLayout` on bootstrap paths |
| `src/sessionizer.test.ts` | Optional: assert `resolveLayoutConfig` seam if runtime injects it   |
| `README.md`               | Document per-repo overrides                                         |

## Open questions (resolved for this slice)

| Question                        | Decision                           |
| ------------------------------- | ---------------------------------- |
| Override path                   | `<cwd>/.sessionizer/config.toml`   |
| Partial overrides               | No — full layout slice replacement |
| Invalid repo config             | Fail loud                          |
| `[projects].roots` in repo file | Ignored                            |
| `layout.placement` in repo file | Ignored; global only               |
