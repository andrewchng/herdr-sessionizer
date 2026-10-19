# Sessionizer verification feature map

Drive these journeys with the **tmux + fzf PTY harness** and the **mock Herdr CLI** (see `../SKILL.md`). Real Herdr server integration is a separate, optional tier.

| Feature                                  | File                                                               | Harness                 |
| ---------------------------------------- | ------------------------------------------------------------------ | ----------------------- |
| Compiled CLI help                        | [cli-help.md](./cli-help.md)                                       | direct subprocess       |
| New project workspace (Sessionizer flow) | [sessionizer-new-project.md](./sessionizer-new-project.md)         | tmux PTY + mock Herdr   |
| Focus existing workspace                 | [sessionizer-focus-workspace.md](./sessionizer-focus-workspace.md) | tmux PTY + mock Herdr   |
| Scripted worktree create                 | [worktree-scripted-create.md](./worktree-scripted-create.md)       | subprocess + mock Herdr |
| Interactive worktree picker              | [worktree-interactive-picker.md](./worktree-interactive-picker.md) | tmux PTY + mock Herdr   |

Default smoke path: **sessionizer-new-project** (`helpers/run-e2e-smoke.sh`).
