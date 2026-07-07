# Project discovery (`[projects]`)

Global config only — never add these to repo-local `.sessionizer/config.toml`.

```toml
[projects]
roots = ["~/Projects"]
git_only = true
depth = 1
```

| Field              | Behavior                                                                               |
| ------------------ | -------------------------------------------------------------------------------------- |
| `roots`            | Parent folders scanned by Sessionizer and Worktree pickers                             |
| `git_only = true`  | Only directories with `.git` metadata                                                  |
| `git_only = false` | Every immediate child folder under each root                                           |
| `depth`            | Levels below each root to scan when `git_only = true`; ignored when `git_only = false` |

When editing discovery:

- Preserve existing `roots`, `git_only`, and `depth` unless the user asks to change them
- Add or remove only the paths the user requested from `roots`
