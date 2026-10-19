# Sessionizer — new project workspace

## Sub-features

- Lists existing Herdr workspaces (empty in scratch).
- Falls through to project discovery under `[projects].roots`.
- Creates workspace + applies `[tabs.*]` layout bootstrap.

## How to get to it (user POV)

Herdr keybinding `sessionizer.open` → Sessionizer pane, or dev:

```bash
./dist/sessionizer sessionizer
```

With no existing workspaces, the project picker appears immediately. With workspaces, press **Esc** on the first picker to reach projects.

## Driving it with tmux PTY

```bash
.cursor/skills/verify-sessionizer/helpers/setup-fixtures.sh
.cursor/skills/verify-sessionizer/helpers/drive-sessionizer-new-project.sh
```

Harness sends `demo-app` + Enter on prompt `Project:` (see `src/sessionizer/sessionizer.ts`).

## Gotchas

- **fzf** requires a real TTY — use tmux, not bare pipes.
- Default smoke uses **mock Herdr**; real server layout timing differs.
- README preview may invoke `bat`; optional on PATH.
