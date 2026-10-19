#!/usr/bin/env bash
# Drive Sessionizer flow: empty workspace list → project picker → demo-app → layout bootstrap.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"
verify_paths
ensure_artifacts_dir
require_built_binary
require_fzf
require_tmux

SESSION="sessionizer-verify"
LOG="$VERIFY_ARTIFACTS/sessionizer-drive.log"
: >"$VERIFY_HERDR_TRACE"

tmux_cmd kill-session -t "$SESSION" 2>/dev/null || true
tmux_cmd new-session -d -s "$SESSION" -x 120 -y 40 -c "$VERIFY_REPO_ROOT"

DRIVE_CMD="export HOME='$VERIFY_HOME' HERDR_PLUGIN_CONFIG_DIR='$VERIFY_CONFIG_DIR' HERDR_BIN_PATH='$HERDR_BIN_PATH' VERIFY_ROOT='$VERIFY_ROOT' VERIFY_PROJECTS_DIR='$VERIFY_PROJECTS_DIR' VERIFY_STATE='$VERIFY_STATE' VERIFY_HERDR_TRACE='$VERIFY_HERDR_TRACE' PATH='/tmp/fzf/bin:${HOME}/.local/bin:/exec-daemon:${PATH}'; ./dist/sessionizer sessionizer"

tmux_cmd send-keys -t "$SESSION" "$DRIVE_CMD" C-m

for _ in $(seq 1 60); do
  if tmux_cmd capture-pane -t "$SESSION" -p | grep -q "Project:"; then
    break
  fi
  sleep 0.2
done

"$SCRIPT_DIR/capture-pane-png.sh" "$SESSION" "$VERIFY_ARTIFACTS/sessionizer-project-picker.png"

tmux_cmd send-keys -t "$SESSION" "demo-app" C-m

for _ in $(seq 1 60); do
  if tmux_cmd capture-pane -t "$SESSION" -p | grep -q "sessionizer-layout-ok\\|✓ workspace"; then
    break
  fi
  sleep 0.25
done

tmux_cmd capture-pane -t "$SESSION" -e -J -p | tee "$LOG"

"$SCRIPT_DIR/capture-pane-png.sh" "$SESSION" "$VERIFY_ARTIFACTS/sessionizer-new-project.png"

if ! grep -q "workspace create" "$VERIFY_HERDR_TRACE"; then
  echo "Expected mock herdr workspace create in trace" >&2
  exit 1
fi
if ! grep -q "pane run" "$VERIFY_HERDR_TRACE"; then
  echo "Expected layout pane run in trace" >&2
  exit 1
fi
if ! grep -q "✓ workspace 'demo-app' created" "$LOG"; then
  echo "Expected success line in drive log" >&2
  exit 1
fi

echo "Drive sessionizer-new-project OK"
