#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"
verify_paths
ensure_artifacts_dir
require_built_binary
require_fzf
require_tmux

SESSION="sessionizer-close"
WS_ID="ws-seed-close"
MODE_RE="Select how to close"
CLOSE_PROMPT_RE="Close workspace:"
SUCCESS_RE="✓ closed ${WS_ID}"
VERIFY_HERDR_TRACE="$(flow_herdr_trace close-workspace)"
export VERIFY_HERDR_TRACE

: >"$VERIFY_HERDR_TRACE"
reset_mock_herdr_state
seed_mock_project_workspace "$WS_ID" "demo-app"

tmux_cmd kill-session -t "$SESSION" 2>/dev/null || true
tmux_cmd new-session -d -s "$SESSION" -x 120 -y 40 -c "$VERIFY_REPO_ROOT"
tmux_apply_record_env "$SESSION"
sleep 0.5

tmux_cmd send-keys -t "$SESSION" "./dist/sessionizer close-flow" C-m
"$SCRIPT_DIR/wait-for-pane-text.sh" "$SESSION" "$MODE_RE" 45

"$SCRIPT_DIR/capture-pane-png.sh" "$SESSION" "$VERIFY_ARTIFACTS/close-mode-picker.png" \
  --require "$MODE_RE" \
  --extract visible

tmux_cmd send-keys -t "$SESSION" C-m
"$SCRIPT_DIR/wait-for-pane-text.sh" "$SESSION" "$CLOSE_PROMPT_RE" 45

"$SCRIPT_DIR/capture-pane-png.sh" "$SESSION" "$VERIFY_ARTIFACTS/close-workspace-picker.png" \
  --require "$CLOSE_PROMPT_RE" \
  --extract visible

tmux_cmd send-keys -t "$SESSION" C-m
"$SCRIPT_DIR/wait-for-pane-text.sh" "$SESSION" "$SUCCESS_RE" 45

"$SCRIPT_DIR/capture-pane-png.sh" "$SESSION" "$VERIFY_ARTIFACTS/close-workspace-success.png" \
  --require "$SUCCESS_RE" \
  --extract success-context

grep -q "workspace close ${WS_ID}" "$VERIFY_HERDR_TRACE"
assert_mock_workspace_absent "$WS_ID"

echo "Drive close-workspace OK"
