#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=record-lib.sh
source "$SCRIPT_DIR/record-lib.sh"
WAIT="$SCRIPT_DIR/wait-for-pane-text.sh"

verify_paths
OUT="$VERIFY_ARTIFACTS/worktree-interactive.mp4"
branch="verify-interactive"
SUCCESS_RE="✓ worktree '${branch}' created and focused"
VERIFY_HERDR_TRACE="$(flow_herdr_trace worktree-interactive)"
export VERIFY_HERDR_TRACE
: >"$VERIFY_HERDR_TRACE"
reset_mock_herdr_state
SESSION="sessionizer-rec-wt-interactive"

record_start_session "$SESSION" "sessionizer-verify-wt-interactive" "$OUT"
tmux_cmd send-keys -t "$SESSION" "./dist/sessionizer worktree" C-m
"$WAIT" "$SESSION" "Base project for worktree:" 45
record_pause 1.5
tmux_cmd send-keys -t "$SESSION" "demo-app" C-m
"$WAIT" "$SESSION" "Worktree branch" 45
record_pause 1.0
tmux_cmd send-keys -t "$SESSION" Escape
"$WAIT" "$SESSION" "Branch name:" 45
record_pause 1.2
for ch in v e r i f y - i n t e r a c t i v e; do
  tmux_cmd send-keys -t "$SESSION" "$ch"
  record_pause 0.2
done
record_pause 1.0
tmux_cmd send-keys -t "$SESSION" C-m
"$WAIT" "$SESSION" "$SUCCESS_RE" 60
record_pause 3.0
record_stop
