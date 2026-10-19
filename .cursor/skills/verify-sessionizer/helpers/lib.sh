#!/usr/bin/env bash
# Shared paths for verify-sessionizer helpers. Source from other scripts:
#   source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

set -euo pipefail

verify_repo_root() {
  if [[ -z "${VERIFY_REPO_ROOT:-}" ]]; then
    VERIFY_REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
  fi
  export VERIFY_REPO_ROOT
}

verify_paths() {
  verify_repo_root
  export VERIFY_ROOT="${VERIFY_ROOT:-/tmp/sessionizer-verify-${USER:-agent}}"
  export VERIFY_ARTIFACTS="${VERIFY_ARTIFACTS:-/opt/cursor/artifacts/sessionizer-verify}"
  export VERIFY_HERDR_TRACE="${VERIFY_HERDR_TRACE:-$VERIFY_ARTIFACTS/herdr-trace.log}"
  export VERIFY_STATE="${VERIFY_STATE:-$VERIFY_ROOT/mock-herdr-state.json}"
  export VERIFY_CONFIG_DIR="${VERIFY_CONFIG_DIR:-$VERIFY_ROOT/config/sessionizer}"
  export VERIFY_PROJECTS_DIR="${VERIFY_PROJECTS_DIR:-$VERIFY_ROOT/projects}"
  export VERIFY_HOME="${VERIFY_HOME:-$VERIFY_ROOT/home}"
  export HERDR_PLUGIN_CONFIG_DIR="${HERDR_PLUGIN_CONFIG_DIR:-$VERIFY_CONFIG_DIR}"
  export HERDR_BIN_PATH="${HERDR_BIN_PATH:-$VERIFY_REPO_ROOT/.cursor/skills/verify-sessionizer/helpers/mock-herdr.sh}"
  export PATH="${VERIFY_REPO_ROOT}/dist:${HOME}/.local/bin:/exec-daemon:${PATH}"
  if ! command -v fzf >/dev/null 2>&1 && [[ -x /tmp/fzf/bin/fzf ]]; then
    export PATH="/tmp/fzf/bin:${PATH}"
  fi
}

ensure_artifacts_dir() {
  verify_paths
  mkdir -p "$VERIFY_ARTIFACTS"
}

reset_mock_herdr_state() {
  verify_paths
  mkdir -p "$(dirname "$VERIFY_STATE")"
  echo '{"workspaces":[],"next_id":1,"pane_seq":1}' >"$VERIFY_STATE"
}

sessionizer_bin() {
  verify_paths
  echo "${VERIFY_REPO_ROOT}/dist/sessionizer"
}

require_built_binary() {
  local bin
  bin="$(sessionizer_bin)"
  if [[ ! -x "$bin" ]]; then
    echo "sessionizer binary missing at $bin — run helpers/launch-build.sh" >&2
    return 1
  fi
}

require_fzf() {
  if ! command -v fzf >/dev/null 2>&1; then
    echo "fzf is required on PATH for picker flows" >&2
    return 1
  fi
}

require_tmux() {
  if [[ -x /exec-daemon/tmux ]]; then
    export VERIFY_TMUX=(/exec-daemon/tmux -f /exec-daemon/tmux.portal.conf)
    return 0
  fi
  if command -v tmux >/dev/null 2>&1; then
    export VERIFY_TMUX=(tmux)
    return 0
  fi
  echo "tmux is required for PTY drive helpers" >&2
  return 1
}

tmux_cmd() {
  require_tmux
  unset TMUX
  "${VERIFY_TMUX[@]}" "$@"
}
