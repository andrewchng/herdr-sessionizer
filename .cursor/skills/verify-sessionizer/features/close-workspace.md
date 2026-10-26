# Close workspace (close-flow)

## Sub-features

- Mode picker (`Select how to close` — Close workspace vs Remove worktrees).
- Workspace multi-select picker (`Close workspace:`).
- Mock Herdr `workspace close <id>` (real Herdr would detach plugin panes).

## How to get to it (user POV)

```bash
./dist/sessionizer close-flow
```

Or Herdr plugin action `sessionizer.close`.

## Driving it with tmux PTY

```bash
.cursor/skills/verify-sessionizer/helpers/setup-fixtures.sh
.cursor/skills/verify-sessionizer/helpers/drive-close-workspace.sh
```

Harness seeds mock state with `ws-seed-close` (`demo-app` cwd) before driving:

1. `./dist/sessionizer close-flow`
2. Enter on **Close workspace** (mode picker default)
3. Enter on the seeded workspace row
4. Wait for `✓ closed ws-seed-close`

## Side-effect checks (not screen text alone)

| Check       | Command / file                                                                                 |
| ----------- | ---------------------------------------------------------------------------------------------- |
| Mock state  | `assert_mock_workspace_absent ws-seed-close` (helper) — workspace removed from `$VERIFY_STATE` |
| Herdr trace | `$VERIFY_ARTIFACTS/herdr-trace-close-workspace.log` contains `workspace close ws-seed-close`   |

## Evidence (smoke)

| PNG                           | Gated on                 |
| ----------------------------- | ------------------------ |
| `close-mode-picker.png`       | `Select how to close`    |
| `close-workspace-picker.png`  | `Close workspace:`       |
| `close-workspace-success.png` | `✓ closed ws-seed-close` |

Optional MP4: `helpers/record-mp4-close-workspace.sh` → `close-workspace.mp4`.

## Gotchas

- Remove-worktree mode is not in default smoke (needs linked worktree rows in mock state).
- Real Herdr server + plugin panes are a separate tier; mock does not run layout pane commands on close.
