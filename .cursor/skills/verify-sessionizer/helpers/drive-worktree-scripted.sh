#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"
verify_paths
ensure_artifacts_dir
require_built_binary

: >"$VERIFY_HERDR_TRACE"
demo="${VERIFY_PROJECTS_DIR}/demo-app"
branch="verify-feature"

export HOME="$VERIFY_HOME"
export HERDR_PLUGIN_CONFIG_DIR="$VERIFY_CONFIG_DIR"
export HERDR_BIN_PATH
export VERIFY_ROOT VERIFY_PROJECTS_DIR VERIFY_STATE VERIFY_HERDR_TRACE

OUT="$VERIFY_ARTIFACTS/worktree-scripted.log"
set -o pipefail
"$(sessionizer_bin)" worktree --project "$demo" --branch "$branch" 2>&1 | tee "$OUT"

grep -q "worktree '${branch}' created" "$OUT" || grep -q "worktree '${branch}'" "$OUT"
grep -q "worktree create" "$VERIFY_HERDR_TRACE"
grep -q "tab rename" "$VERIFY_HERDR_TRACE" || grep -q "pane run" "$VERIFY_HERDR_TRACE"

echo "Drive worktree-scripted OK"
