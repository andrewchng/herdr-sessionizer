---
name: verify-sessionizer
description: Drive Herdr Sessionizer (compiled dist/sessionizer CLI + fzf pickers) in an isolated scratch harness with mock Herdr. Use before releases or when changing Sessionizer, worktree, close, or layout bootstrap flows.
---

# Verify Sessionizer

Sessionizer’s primary surface is the **compiled plugin binary** (`dist/sessionizer`) running **fzf-backed pickers** in a terminal. Herdr hosts plugin panes in production; verification uses a **mock Herdr CLI** plus **tmux PTY** so agents never attach to a user’s live Herdr server.

## Launch

One-time build (from repo root):

```bash
.cursor/skills/verify-sessionizer/helpers/launch-build.sh
```

This runs `bun install --ignore-scripts`, `bun run build`, ensures **fzf** is on `PATH` (installs to `~/.local/bin` or uses `/tmp/fzf/bin/fzf`), and checks `./dist/sessionizer --help`.

Scratch fixtures (temp HOME, git repos, Sessionizer `config.toml`):

```bash
.cursor/skills/verify-sessionizer/helpers/setup-fixtures.sh
```

Isolation env (set automatically by helpers):

| Variable                  | Purpose                                                                  |
| ------------------------- | ------------------------------------------------------------------------ |
| `VERIFY_ROOT`             | `/tmp/sessionizer-verify-$USER` — scratch tree                           |
| `VERIFY_HOME`             | Empty HOME under `VERIFY_ROOT`                                           |
| `HERDR_PLUGIN_CONFIG_DIR` | `$VERIFY_ROOT/config/sessionizer`                                        |
| `HERDR_BIN_PATH`          | Mock Herdr script (not real `herdr`)                                     |
| `VERIFY_ARTIFACTS`        | `/opt/cursor/artifacts/sessionizer-verify` — evidence (survives cleanup) |

Teardown of scratch **instances** (not evidence): `helpers/cleanup.sh`.

## Doctor

Read-only “worth driving?” check (run after `setup-fixtures.sh`):

```bash
.cursor/skills/verify-sessionizer/helpers/doctor.sh
```

Confirms: executable `dist/sessionizer`, `fzf`, mock Herdr, fixture git repo, config file.

## Drive

**Harness:** `tmux` with `/exec-daemon/tmux.portal.conf` when present; **stable prompts** from `src/sessionizer/sessionizer.ts` and `src/ui/fzf.ts` (`Project:`, `Switch session (Esc for new):`, etc.).

| Journey                                           | Helper                                     |
| ------------------------------------------------- | ------------------------------------------ |
| Sessionizer → new project workspace               | `helpers/drive-sessionizer-new-project.sh` |
| Worktree scripted (`--project` / `--branch`)      | `helpers/drive-worktree-scripted.sh`       |
| Worktree interactive (repo → branch fzf → create) | `helpers/drive-worktree-interactive.sh`    |
| Close workspace (`close-flow`)                    | `helpers/drive-close-workspace.sh`         |
| Full smoke (all flows + optional MP4)             | `helpers/run-e2e-smoke.sh`                 |

Mock Herdr implements `workspace`, `worktree`, `tab`, and `pane` subcommands Sessionizer calls. Per-flow argv logs: `$VERIFY_ARTIFACTS/herdr-trace-<flow>.log` (see `flow_herdr_trace` in `lib.sh`). Worktree create runs **real** `git worktree add` under `$VERIFY_ROOT/worktrees/`.

Smoke flow toggles: `VERIFY_SMOKE_FLOWS`, `VERIFY_SKIP_FLOW_*`, `VERIFY_SKIP_MP4=1` (see `features/README.md`).

**Real Herdr tier (optional, not in default smoke):** install `herdr` (`curl -fsSL https://herdr.dev/install.sh | sh`), start `herdr` server, `herdr plugin link` this repo after `bun run build`, invoke `herdr plugin action invoke sessionizer.open`. Requires a graphical/attachable terminal — not used in cloud smoke.

Feature map: [`features/README.md`](features/README.md).

## Evidence

Proof standard: drive the **user-visible path** (fzf selection → Herdr workspace create → layout pane commands), not unit-test mocks.

Capture after each drive:

| Artifact                                           | Contents                                                       |
| -------------------------------------------------- | -------------------------------------------------------------- |
| `$VERIFY_ARTIFACTS/sessionizer-project-picker.png` | fzf project list (tmux pane render)                            |
| `$VERIFY_ARTIFACTS/sessionizer-new-project.png`    | Success line (`✓ workspace 'demo-app' created…`) in scrollback |
| `$VERIFY_ARTIFACTS/worktree-*-.png`                | Worktree flows — picker / prompt / success (≥2 PNGs each)      |
| `$VERIFY_ARTIFACTS/close-*.png`                    | Close flow — mode picker, workspace picker, success            |
| `$VERIFY_ARTIFACTS/*.mp4`                          | Optional 10–20s Xvfb+xterm+ffmpeg per flow (`record-mp4-*.sh`) |
| `$VERIFY_ARTIFACTS/herdr-trace-<flow>.log`         | Mock Herdr argv for that flow                                  |

Side effects to assert in smoke (helpers grep / python checks):

- **Worktree flows:** `git -C $VERIFY_PROJECTS_DIR/demo-app worktree list` shows new branch checkout under `$VERIFY_ROOT/worktrees/…`
- **Close flow:** seeded `ws-seed-close` absent from `$VERIFY_STATE` after drive
- **Traces:** `worktree create`, `workspace focus` / `pane run`, or `workspace close` as appropriate

`wait-for-pane-text.sh` polls tmux scrollback until required text appears (fails on timeout). `capture-pane-png.sh` refuses to render until `--require` matches; success shots use `--extract success-context` so the checkmark line is not scrolled off-screen.

**Cleanup must not delete `VERIFY_ARTIFACTS`.** After `cleanup.sh`, confirm files still exist.

## Cleanup

```bash
.cursor/skills/verify-sessionizer/helpers/cleanup.sh
```

Kills tmux session `sessionizer-verify` only; removes `VERIFY_ROOT` under `/tmp/sessionizer-verify*`. Leaves `$VERIFY_ARTIFACTS` intact.

## Helpers

All scripts in `helpers/` are executable.

| Script                             | Role                                |
| ---------------------------------- | ----------------------------------- |
| `lib.sh`                           | Shared paths, tmux wrapper          |
| `launch-build.sh`                  | Build binary + fzf                  |
| `setup-fixtures.sh`                | Scratch repos + config              |
| `mock-herdr.sh`                    | Stub Herdr JSON CLI                 |
| `doctor.sh`                        | Preflight                           |
| `drive-sessionizer-new-project.sh` | PTY drive Sessionizer flow          |
| `drive-worktree-scripted.sh`       | `worktree --project --branch`       |
| `drive-worktree-interactive.sh`    | Full repo → branch fzf worktree     |
| `drive-close-workspace.sh`         | Seeded workspace → `close-flow`     |
| `wait-for-pane-text.sh`            | Poll tmux scrollback for text       |
| `capture-pane-png.sh`              | Terminal → PNG                      |
| `write-record-env.sh`              | Sourceable env for MP4 (off-screen) |
| `record-lib.sh`                    | Shared Xvfb/xterm/ffmpeg            |
| `record-mp4.sh`                    | MP4 — sessionizer new project       |
| `record-mp4-worktree-*.sh`         | MP4 — worktree flows                |
| `record-mp4-close-workspace.sh`    | MP4 — close flow                    |
| `cleanup.sh`                       | Tear down scratch                   |
| `run-e2e-smoke.sh`                 | End-to-end proof (+ MP4)            |

Maintenance: run `/maintain-verification-skill` when UX or Herdr APIs change.
