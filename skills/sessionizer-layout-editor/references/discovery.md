# Project discovery (`[projects]`)

Global config only — never add these to repo-local `.sessionizer/config.toml`.

```toml
[projects]
roots = ["~/Projects", "~/Projects/github.com/*"]
git_only = true
depth = 1
```

| Field              | Behavior                                                                                                                |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `roots`            | Parent folders or glob expressions scanned by Sessionizer and Worktree pickers; globs expand to directories at use-time |
| `git_only = true`  | Only directories with `.git` metadata                                                                                   |
| `git_only = false` | Every immediate child folder under each root                                                                            |
| `depth`            | Levels below each root to scan when `git_only = true`; ignored when `git_only = false`                                  |

When editing discovery:

- Preserve existing `roots`, `git_only`, and `depth` unless the user asks to change them
- Add or remove only the paths the user requested from `roots`

## Glob roots

A `roots` entry may be a glob expression instead of a plain path. Supported metacharacters: `*`, `?`, `[`, `{` (as understood by `Bun.Glob`). Globs expand to directories **at use-time** — when the pickers scan, not when the config is loaded — so newly added directories are picked up without a config reload.

When to use each form (assuming the ghq convention `~/Projects/<host>/<owner>/<repo>`):

- Plain path (`~/Projects`) — flat host layouts, e.g. `aur.archlinux.org` packages sitting directly under the root.
- `*` — one level deep. `~/Projects/github.com/*` expands to owner directories; combined with `git_only = true` + `depth = 1` it returns the repos under each owner, not the owner folders themselves.
- `**` — recursive. `~/Projects/github.com/**` reaches nested repos at any depth.

Gotchas:

- Files matched by a glob are filtered out — only directories become bases.
- A zero-match glob contributes nothing (no error).
- A glob whose base directory is missing is logged and skipped; discovery continues with the remaining roots.
- `~` is expanded by the config loader before `listProjects` sees the entry, so globs containing `~` survive. Direct callers passing a raw `~/...` glob are also handled defensively.
