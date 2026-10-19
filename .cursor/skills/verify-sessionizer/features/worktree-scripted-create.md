# Worktree — scripted create

## Sub-features

- Non-interactive `worktree --project <path> --branch <name>`.
- Creates worktree workspace via Herdr + layout bootstrap.

## How to get to it (user POV)

```bash
./dist/sessionizer worktree --project ~/Projects/my-repo --branch feat/x
```

Or Herdr pane env passthrough (`WORKTREE_PROJECT`, `WORKTREE_BRANCH`).

## Driving it with subprocess

```bash
.cursor/skills/verify-sessionizer/helpers/setup-fixtures.sh
.cursor/skills/verify-sessionizer/helpers/drive-worktree-scripted.sh
```

Expect log line `✓ worktree 'verify-feature' created and focused` and `worktree create` in `herdr-trace.log`.

## Gotchas

- Mock Herdr does not run real `git worktree`; git checks in `localBranchExists` still hit the fixture repo.
- Real Herdr tier required to verify actual checkout paths on disk.
