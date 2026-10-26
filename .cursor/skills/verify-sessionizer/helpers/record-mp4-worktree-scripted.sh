#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=record-lib.sh
source "$SCRIPT_DIR/record-lib.sh"
WAIT="$SCRIPT_DIR/wait-for-pane-text.sh"

verify_paths
OUT="$VERIFY_ARTIFACTS/worktree-scripted.mp4"
demo="${VERIFY_PROJECTS_DIR}/demo-app"
branch="verify-feature"
SUCCESS_RE="✓ worktree '${branch}' created and focused"
VERIFY_HERDR_TRACE="$(flow_herdr_trace worktree-scripted)"
export VERIFY_HERDR_TRACE
: >"$VERIFY_HERDR_TRACE"
reset_mock_herdr_state
SESSION="sessionizer-rec-wt-scripted"

record_start_session "$SESSION" "sessionizer-verify-wt-scripted" "$OUT"
record_pause 1.0
CMD="./dist/sessionizer worktree --project $(printf '%q' "$demo") --branch $branch"
tmux_cmd send-keys -t "$SESSION" "$CMD" C-m
record_pause 2.0
"$WAIT" "$SESSION" "$SUCCESS_RE" 60
record_pause 6.0
record_stop
