# Worktree — scripted create

## Sub-features

- Non-interactive `worktree --project <path> --branch <name>`.
- Herdr `worktree open` → `worktree create` on miss, layout bootstrap, `workspace focus`.

## How to get to it (user POV)

```bash
./dist/sessionizer worktree --project ~/Projects/my-repo --branch feat/x
```

Or Herdr pane env passthrough (`WORKTREE_PROJECT`, `WORKTREE_BRANCH`).

## Driving it

```bash
.cursor/skills/verify-sessionizer/helpers/setup-fixtures.sh
.cursor/skills/verify-sessionizer/helpers/drive-worktree-scripted.sh
```

Default smoke runs this via `helpers/run-e2e-smoke.sh` (`worktree_scripted` flow).

Expect terminal line `✓ worktree 'verify-feature' created and focused`.

## Side-effect checks (not screen text alone)

| Check             | Command / file                                                                                                                                        |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Real git worktree | `git -C $VERIFY_PROJECTS_DIR/demo-app worktree list --porcelain` lists branch `verify-feature` under `$VERIFY_ROOT/worktrees/demo-app/verify-feature` |
| Herdr trace       | `$VERIFY_ARTIFACTS/herdr-trace-worktree-scripted.log` includes `worktree create`, `pane run`, and `workspace focus`                                   |

## Evidence (smoke)

| PNG                             | Gated on               |
| ------------------------------- | ---------------------- |
| `worktree-scripted-command.png` | command line visible   |
| `worktree-scripted-success.png` | success checkmark line |

Optional MP4: `helpers/record-mp4-worktree-scripted.sh` → `worktree-scripted.mp4`.

## Gotchas

- Mock Herdr runs **real** `git worktree add` into `$VERIFY_ROOT/worktrees/…` (scratch only).
- Re-running smoke without `setup-fixtures.sh` may hit duplicate-branch paths if worktrees already exist.
