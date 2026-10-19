# Worktree — interactive picker

## Sub-features

- Repo picker (`Base project for worktree:`).
- Branch / PR candidates, Esc → new branch name prompt.

## How to get to it (user POV)

`sessionizer.worktree-open` or `./dist/sessionizer worktree` with no `--project`/`--branch`.

## Driving it with tmux PTY

Mirror `drive-sessionizer-new-project.sh`:

1. `setup-fixtures.sh`
2. tmux: `export` scratch env + `./dist/sessionizer worktree`
3. Wait for `Base project for worktree:`; type `demo-app`, Enter
4. On branch picker, Esc then type branch name on `Branch name:` prompt

## Gotchas

- `[worktree].github_prs = true` needs authenticated `gh` — disabled in scratch config.
- Not in default smoke; implement a dedicated helper before relying on CI.
