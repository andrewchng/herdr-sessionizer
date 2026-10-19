#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

run_flow() {
  local key="$1"
  shift
  if flow_enabled "$key"; then
    "$@"
  else
    echo "SKIP flow $key"
  fi
}

"$SCRIPT_DIR/launch-build.sh"
"$SCRIPT_DIR/setup-fixtures.sh"
"$SCRIPT_DIR/doctor.sh"

run_flow sessionizer_new_project "$SCRIPT_DIR/drive-sessionizer-new-project.sh"
if [[ "${VERIFY_SKIP_MP4:-}" != "1" ]] && flow_enabled sessionizer_new_project; then
  "$SCRIPT_DIR/record-mp4.sh"
fi

run_flow worktree_scripted "$SCRIPT_DIR/drive-worktree-scripted.sh"
if [[ "${VERIFY_SKIP_MP4:-}" != "1" ]] && flow_enabled worktree_scripted; then
  "$SCRIPT_DIR/record-mp4-worktree-scripted.sh"
fi

run_flow worktree_interactive "$SCRIPT_DIR/drive-worktree-interactive.sh"
if [[ "${VERIFY_SKIP_MP4:-}" != "1" ]] && flow_enabled worktree_interactive; then
  "$SCRIPT_DIR/record-mp4-worktree-interactive.sh"
fi

run_flow close_workspace "$SCRIPT_DIR/drive-close-workspace.sh"
if [[ "${VERIFY_SKIP_MP4:-}" != "1" ]] && flow_enabled close_workspace; then
  "$SCRIPT_DIR/record-mp4-close-workspace.sh"
fi

"$SCRIPT_DIR/cleanup.sh"

verify_paths
test -f "$VERIFY_ARTIFACTS/sessionizer-new-project.png"
test -f "$(flow_herdr_trace sessionizer-new-project)"
if flow_enabled worktree_scripted; then
  test -f "$VERIFY_ARTIFACTS/worktree-scripted-success.png"
  test -f "$(flow_herdr_trace worktree-scripted)"
fi
if flow_enabled worktree_interactive; then
  test -f "$VERIFY_ARTIFACTS/worktree-interactive-success.png"
  test -f "$(flow_herdr_trace worktree-interactive)"
  grep -q "worktree create" "$(flow_herdr_trace worktree-interactive)"
fi
if flow_enabled close_workspace; then
  test -f "$VERIFY_ARTIFACTS/close-workspace-success.png"
  test -f "$(flow_herdr_trace close-workspace)"
  grep -q "workspace close" "$(flow_herdr_trace close-workspace)"
fi
echo "E2E smoke passed"
