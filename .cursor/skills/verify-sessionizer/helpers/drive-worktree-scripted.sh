#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"
verify_paths
ensure_artifacts_dir
require_built_binary
require_tmux

SESSION="sessionizer-worktree-scripted"
demo="${VERIFY_PROJECTS_DIR}/demo-app"
branch="verify-feature"
SUCCESS_RE="✓ worktree '${branch}' created and focused"
VERIFY_HERDR_TRACE="$(flow_herdr_trace worktree-scripted)"
export VERIFY_HERDR_TRACE

: >"$VERIFY_HERDR_TRACE"
reset_mock_herdr_state

tmux_cmd kill-session -t "$SESSION" 2>/dev/null || true
tmux_cmd new-session -d -s "$SESSION" -x 120 -y 40 -c "$VERIFY_REPO_ROOT"
tmux_apply_record_env "$SESSION"
sleep 0.5

CMD="./dist/sessionizer worktree --project $(printf '%q' "$demo") --branch $branch"
tmux_cmd send-keys -t "$SESSION" "$CMD" C-m

"$SCRIPT_DIR/wait-for-pane-text.sh" "$SESSION" "./dist/sessionizer worktree" 10

"$SCRIPT_DIR/capture-pane-png.sh" "$SESSION" "$VERIFY_ARTIFACTS/worktree-scripted-command.png" \
  --require "./dist/sessionizer worktree" \
  --extract visible

"$SCRIPT_DIR/wait-for-pane-text.sh" "$SESSION" "$SUCCESS_RE" 60

"$SCRIPT_DIR/capture-pane-png.sh" "$SESSION" "$VERIFY_ARTIFACTS/worktree-scripted-success.png" \
  --require "$SUCCESS_RE" \
  --extract success-context

grep -q "worktree create" "$VERIFY_HERDR_TRACE"
grep -q "workspace focus" "$VERIFY_HERDR_TRACE" || grep -q "pane run" "$VERIFY_HERDR_TRACE"
git_worktree_list "$demo" | grep -q "$branch"

echo "Drive worktree-scripted OK"
