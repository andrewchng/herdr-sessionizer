#!/usr/bin/env bash
# MP4: sessionizer new-project flow.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=record-lib.sh
source "$SCRIPT_DIR/record-lib.sh"
WAIT="$SCRIPT_DIR/wait-for-pane-text.sh"

OUT="${VERIFY_ARTIFACTS:-/opt/cursor/artifacts/sessionizer-verify}/sessionizer-new-project.mp4"
verify_paths
export VERIFY_HERDR_TRACE
VERIFY_HERDR_TRACE="$(flow_herdr_trace sessionizer-new-project)"
: >"$VERIFY_HERDR_TRACE"
reset_mock_herdr_state

SUCCESS_RE="✓ workspace 'demo-app' created and focused"
PICKER_RE="Select a project to create a workspace"
SESSION="sessionizer-rec-mp4"

record_start_session "$SESSION" "sessionizer-verify-new-project" "$OUT"

tmux_cmd send-keys -t "$SESSION" "./dist/sessionizer sessionizer" C-m
"$WAIT" "$SESSION" "$PICKER_RE" 45
record_pause 2.0
for ch in d e m o; do
  tmux_cmd send-keys -t "$SESSION" "$ch"
  record_pause 0.45
done
record_pause 1.5
tmux_cmd send-keys -t "$SESSION" C-m
"$WAIT" "$SESSION" "$SUCCESS_RE" 60
record_pause 3.0
record_stop
