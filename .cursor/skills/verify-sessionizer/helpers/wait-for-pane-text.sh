#!/usr/bin/env bash
# Poll tmux pane scrollback until a pattern appears (or timeout).
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

usage() {
  echo "Usage: wait-for-pane-text.sh <tmux-session> <grep-pattern> [timeout_seconds]" >&2
  exit 1
}

[[ $# -ge 2 ]] || usage
SESSION="$1"
PATTERN="$2"
TIMEOUT="${3:-60}"

verify_paths
require_tmux

deadline=$((SECONDS + TIMEOUT))
while (( SECONDS < deadline )); do
  pane="$(tmux_cmd capture-pane -t "$SESSION" -S -32000 -E - -p 2>/dev/null || true)"
  if printf '%s\n' "$pane" | grep -qF "$PATTERN"; then
    echo "wait-for-pane-text: matched /$PATTERN/ in session $SESSION"
    exit 0
  fi
  sleep 0.25
done

echo "wait-for-pane-text: timed out after ${TIMEOUT}s waiting for /$PATTERN/ in tmux session $SESSION" >&2
tmux_cmd capture-pane -t "$SESSION" -S -32000 -E - -p | tail -40 >&2 || true
exit 1
