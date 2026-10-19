# Worktree — interactive picker

## Sub-features

- Repo picker (`Base project for worktree:`) with README preview.
- Branch candidate picker (`Worktree branch (Esc for new):`).
- Esc → `Branch name:` prompt for a new branch.

## How to get to it (user POV)

`sessionizer.worktree-open` or `./dist/sessionizer worktree` with no `--project`/`--branch`.

## Driving it with tmux PTY

```bash
.cursor/skills/verify-sessionizer/helpers/setup-fixtures.sh
.cursor/skills/verify-sessionizer/helpers/drive-worktree-interactive.sh
```

Steps mirrored in the helper:

1. `./dist/sessionizer worktree`
2. Wait for `Base project for worktree:`; type `demo-app`, Enter
3. On branch picker, Esc → type `verify-interactive` on `Branch name:`, Enter
4. Wait for `✓ worktree 'verify-interactive' created and focused`

Default smoke: `helpers/run-e2e-smoke.sh` (`worktree_interactive` flow).

## Side-effect checks (not screen text alone)

| Check             | Command / file                                                                      |
| ----------------- | ----------------------------------------------------------------------------------- |
| Real git worktree | `git_worktree_list` (see `helpers/lib.sh`) shows `verify-interactive` checkout      |
| Herdr trace       | `$VERIFY_ARTIFACTS/herdr-trace-worktree-interactive.log` includes `worktree create` |

## Evidence (smoke)

| PNG                                      | Gated on                     |
| ---------------------------------------- | ---------------------------- |
| `worktree-interactive-repo-picker.png`   | `Base project for worktree:` |
| `worktree-interactive-branch-prompt.png` | `Branch name:`               |
| `worktree-interactive-success.png`       | success checkmark line       |

Optional MP4: `helpers/record-mp4-worktree-interactive.sh` → `worktree-interactive.mp4` (~16s paced typing).

## Gotchas

- `[worktree].github_prs = true` needs authenticated `gh` — disabled in scratch config.
- Prior smoke runs leave `verify-feature` worktree rows visible in the branch picker (expected).
