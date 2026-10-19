#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"
verify_paths

SESSION="sessionizer-verify"
require_tmux || true
tmux_cmd kill-session -t "$SESSION" 2>/dev/null || true

if [[ -n "${VERIFY_ROOT:-}" && "$VERIFY_ROOT" == /tmp/sessionizer-verify* ]]; then
  rm -rf "$VERIFY_ROOT"
fi

# Evidence under VERIFY_ARTIFACTS is intentionally kept.
if [[ -d "$VERIFY_ARTIFACTS" ]]; then
  echo "Evidence preserved at $VERIFY_ARTIFACTS"
  ls -la "$VERIFY_ARTIFACTS"
fi
