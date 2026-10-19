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

flow_herdr_trace() {
  verify_paths
  echo "${VERIFY_ARTIFACTS}/herdr-trace-${1}.log"
}

flow_enabled() {
  local key="$1"
  local upper
  upper="$(echo "$key" | tr '[:lower:]' '[:upper:]' | tr '-' '_')"
  local skip_var="VERIFY_SKIP_FLOW_${upper}"
  if [[ -n "${!skip_var:-}" ]]; then
    return 1
  fi
  local flows="${VERIFY_SMOKE_FLOWS:-all}"
  if [[ "$flows" == "all" ]]; then
    return 0
  fi
  [[ ",${flows}," == *",${key},"* ]]
}

apply_verify_env() {
  verify_paths
  export HOME="$VERIFY_HOME"
  export HERDR_PLUGIN_CONFIG_DIR="$VERIFY_CONFIG_DIR"
  export HERDR_BIN_PATH
  export VERIFY_ROOT VERIFY_PROJECTS_DIR VERIFY_STATE VERIFY_HERDR_TRACE
  export PATH="/tmp/fzf/bin:${HOME}/.local/bin:/exec-daemon:${VERIFY_REPO_ROOT}/dist:/usr/bin:/bin"
}

tmux_apply_record_env() {
  local session="$1"
  local helpers="${VERIFY_REPO_ROOT}/.cursor/skills/verify-sessionizer/helpers"
  local env_file
  env_file="$("$helpers/write-record-env.sh")"
  tmux_cmd send-keys -t "$session" "source $(printf '%q' "$env_file") && clear" C-m
}

seed_mock_project_workspace() {
  local ws_id="${1:-ws-seed-close}"
  local label="${2:-demo-app}"
  verify_paths
  python3 - "$VERIFY_STATE" "$ws_id" "$label" "$VERIFY_PROJECTS_DIR/demo-app" <<'PY'
import json, sys
state_path, ws_id, label, cwd = sys.argv[1:5]
with open(state_path) as f:
    state = json.load(f)
state["workspaces"] = [w for w in state["workspaces"] if w.get("workspace_id") != ws_id]
state["workspaces"].append(
    {
        "workspace_id": ws_id,
        "label": label,
        "cwd": cwd,
        "tab_count": 1,
        "pane_count": 1,
    }
)
with open(state_path, "w") as f:
    json.dump(state, f)
PY
}

assert_mock_workspace_absent() {
  local ws_id="$1"
  python3 - "$VERIFY_STATE" "$ws_id" <<'PY'
import json, sys
state_path, ws_id = sys.argv[1:3]
with open(state_path) as f:
    state = json.load(f)
if any(w.get("workspace_id") == ws_id for w in state["workspaces"]):
    raise SystemExit(f"workspace {ws_id} still in mock state")
PY
}

git_worktree_list() {
  local repo="${1:-$VERIFY_PROJECTS_DIR/demo-app}"
  git -C "$repo" worktree list --porcelain
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
