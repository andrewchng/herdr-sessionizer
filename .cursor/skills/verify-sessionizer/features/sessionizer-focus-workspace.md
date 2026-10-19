# Sessionizer — focus existing workspace

## Sub-features

- Workspace picker with `Switch session (Esc for new):` header.
- Enter on a row calls `workspace focus` (no relayout).

## How to get to it (user POV)

Open Sessionizer when Herdr already has Sessionizer workspaces listed.

## Driving it with tmux PTY

Seed mock state before drive:

1. Run `setup-fixtures.sh`.
2. Append a workspace to `$VERIFY_ROOT/mock-herdr-state.json` or invoke mock Herdr once:

   ```bash
   HERDR_BIN_PATH=... VERIFY_STATE=... "$HERDR_BIN_PATH" workspace create --cwd ... --label demo-app
   ```

3. Start `./dist/sessionizer sessionizer` in tmux; select the workspace row with Enter (no Esc).

## Gotchas

- Not covered by default smoke; mock state must include at least one workspace or the flow skips to new-project.
- Row format uses `WORKSPACE_ROW_DELIMITER` — filter fzf by workspace label, not raw id.
