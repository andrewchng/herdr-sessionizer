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

| Journey                                                      | Helper                                     |
| ------------------------------------------------------------ | ------------------------------------------ |
| Sessionizer → new project workspace                          | `helpers/drive-sessionizer-new-project.sh` |
| Worktree non-interactive                                     | `helpers/drive-worktree-scripted.sh`       |
| Full smoke (launch → setup → doctor → new project → cleanup) | `helpers/run-e2e-smoke.sh`                 |

Mock Herdr implements `workspace`, `worktree`, `tab`, and `pane` subcommands Sessionizer calls; argv log: `$VERIFY_ARTIFACTS/herdr-trace.log`.

**Real Herdr tier (optional, not in default smoke):** install `herdr` (`curl -fsSL https://herdr.dev/install.sh | sh`), start `herdr` server, `herdr plugin link` this repo after `bun run build`, invoke `herdr plugin action invoke sessionizer.open`. Requires a graphical/attachable terminal — not used in cloud smoke.

Feature map: [`features/README.md`](features/README.md).

## Evidence

Proof standard: drive the **user-visible path** (fzf selection → Herdr workspace create → layout pane commands), not unit-test mocks.

Capture after each drive:

| Artifact                                           | Contents                                                      |
| -------------------------------------------------- | ------------------------------------------------------------- |
| `$VERIFY_ARTIFACTS/sessionizer-project-picker.png` | fzf project list (tmux pane render)                           |
| `$VERIFY_ARTIFACTS/sessionizer-new-project.png`    | Success line + shell after bootstrap                          |
| `$VERIFY_ARTIFACTS/sessionizer-drive.log`          | Full tmux pane transcript                                     |
| `$VERIFY_ARTIFACTS/herdr-trace.log`                | Mock Herdr argv (must include `workspace create`, `pane run`) |

PNG helper waits for pane text, strips ANSI, renders with Pillow (`helpers/capture-pane-png.sh`).

**Cleanup must not delete `VERIFY_ARTIFACTS`.** After `cleanup.sh`, confirm files still exist.

## Cleanup

```bash
.cursor/skills/verify-sessionizer/helpers/cleanup.sh
```

Kills tmux session `sessionizer-verify` only; removes `VERIFY_ROOT` under `/tmp/sessionizer-verify*`. Leaves `$VERIFY_ARTIFACTS` intact.

## Helpers

All scripts in `helpers/` are executable.

| Script                             | Role                          |
| ---------------------------------- | ----------------------------- |
| `lib.sh`                           | Shared paths, tmux wrapper    |
| `launch-build.sh`                  | Build binary + fzf            |
| `setup-fixtures.sh`                | Scratch repos + config        |
| `mock-herdr.sh`                    | Stub Herdr JSON CLI           |
| `doctor.sh`                        | Preflight                     |
| `drive-sessionizer-new-project.sh` | PTY drive Sessionizer flow    |
| `drive-worktree-scripted.sh`       | `worktree --project --branch` |
| `capture-pane-png.sh`              | Terminal → PNG                |
| `cleanup.sh`                       | Tear down scratch             |
| `run-e2e-smoke.sh`                 | End-to-end proof              |

Maintenance: run `/maintain-verification-skill` when UX or Herdr APIs change.
