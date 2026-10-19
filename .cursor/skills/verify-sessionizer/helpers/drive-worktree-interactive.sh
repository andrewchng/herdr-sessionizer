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

SESSION="sessionizer-worktree-interactive"
branch="verify-interactive"
REPO_RE="Base project for worktree:"
BRANCH_RE="Branch name:"
SUCCESS_RE="✓ worktree '${branch}' created and focused"
VERIFY_HERDR_TRACE="$(flow_herdr_trace worktree-interactive)"
export VERIFY_HERDR_TRACE

: >"$VERIFY_HERDR_TRACE"
reset_mock_herdr_state

tmux_cmd kill-session -t "$SESSION" 2>/dev/null || true
tmux_cmd new-session -d -s "$SESSION" -x 120 -y 40 -c "$VERIFY_REPO_ROOT"
tmux_apply_record_env "$SESSION"
sleep 0.5

tmux_cmd send-keys -t "$SESSION" "./dist/sessionizer worktree" C-m
"$SCRIPT_DIR/wait-for-pane-text.sh" "$SESSION" "$REPO_RE" 45

"$SCRIPT_DIR/capture-pane-png.sh" "$SESSION" "$VERIFY_ARTIFACTS/worktree-interactive-repo-picker.png" \
  --require "$REPO_RE" \
  --extract visible

tmux_cmd send-keys -t "$SESSION" "demo-app" C-m
"$SCRIPT_DIR/wait-for-pane-text.sh" "$SESSION" "Worktree branch" 45
tmux_cmd send-keys -t "$SESSION" Escape
"$SCRIPT_DIR/wait-for-pane-text.sh" "$SESSION" "$BRANCH_RE" 45

"$SCRIPT_DIR/capture-pane-png.sh" "$SESSION" "$VERIFY_ARTIFACTS/worktree-interactive-branch-prompt.png" \
  --require "$BRANCH_RE" \
  --extract visible

tmux_cmd send-keys -t "$SESSION" "$branch" C-m
"$SCRIPT_DIR/wait-for-pane-text.sh" "$SESSION" "$SUCCESS_RE" 60

"$SCRIPT_DIR/capture-pane-png.sh" "$SESSION" "$VERIFY_ARTIFACTS/worktree-interactive-success.png" \
  --require "$SUCCESS_RE" \
  --extract success-context

grep -q "worktree create" "$VERIFY_HERDR_TRACE"
git_worktree_list "${VERIFY_PROJECTS_DIR}/demo-app" | grep -q "$branch"

echo "Drive worktree-interactive OK"
