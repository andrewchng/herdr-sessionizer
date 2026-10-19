#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=record-lib.sh
source "$SCRIPT_DIR/record-lib.sh"
WAIT="$SCRIPT_DIR/wait-for-pane-text.sh"

verify_paths
OUT="$VERIFY_ARTIFACTS/close-workspace.mp4"
WS_ID="ws-seed-close"
SUCCESS_RE="✓ closed ${WS_ID}"
VERIFY_HERDR_TRACE="$(flow_herdr_trace close-workspace)"
export VERIFY_HERDR_TRACE
: >"$VERIFY_HERDR_TRACE"
reset_mock_herdr_state
seed_mock_project_workspace "$WS_ID" "demo-app"
SESSION="sessionizer-rec-close"

record_start_session "$SESSION" "sessionizer-verify-close" "$OUT"
record_pause 1.0
tmux_cmd send-keys -t "$SESSION" "./dist/sessionizer close-flow" C-m
"$WAIT" "$SESSION" "Select how to close" 45
record_pause 2.5
tmux_cmd send-keys -t "$SESSION" C-m
"$WAIT" "$SESSION" "Close workspace:" 45
record_pause 2.5
tmux_cmd send-keys -t "$SESSION" C-m
"$WAIT" "$SESSION" "$SUCCESS_RE" 45
record_pause 5.0
record_stop
