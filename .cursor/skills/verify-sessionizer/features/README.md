# Sessionizer verification feature map

Drive these journeys with the **tmux + fzf PTY harness** and the **mock Herdr CLI** (see `../SKILL.md`). Real Herdr server integration is a separate, optional tier.

| Feature                                  | File                                                               | Harness               |
| ---------------------------------------- | ------------------------------------------------------------------ | --------------------- |
| Compiled CLI help                        | [cli-help.md](./cli-help.md)                                       | direct subprocess     |
| New project workspace (Sessionizer flow) | [sessionizer-new-project.md](./sessionizer-new-project.md)         | tmux PTY + mock Herdr |
| Focus existing workspace                 | [sessionizer-focus-workspace.md](./sessionizer-focus-workspace.md) | tmux PTY + mock Herdr |
| Scripted worktree create                 | [worktree-scripted-create.md](./worktree-scripted-create.md)       | tmux PTY + mock Herdr |
| Interactive worktree picker              | [worktree-interactive-picker.md](./worktree-interactive-picker.md) | tmux PTY + mock Herdr |
| Close workspace (close-flow)             | [close-workspace.md](./close-workspace.md)                         | tmux PTY + mock Herdr |

Default smoke: `helpers/run-e2e-smoke.sh` (all flows unless filtered).

Flow toggles:

- `VERIFY_SMOKE_FLOWS=all` or comma list: `sessionizer_new_project,worktree_scripted,worktree_interactive,close_workspace`
- `VERIFY_SKIP_FLOW_<KEY>=1` — skip one flow (key uppercased, `-` → `_`)
- `VERIFY_SKIP_MP4=1` — PNG + side-effect checks only
