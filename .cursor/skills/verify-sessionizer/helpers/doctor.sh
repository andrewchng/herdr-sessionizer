#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"
verify_paths

fail=0
check() {
  if "$@"; then
    echo "OK  $*"
  else
    echo "FAIL $*" >&2
    fail=1
  fi
}

check require_built_binary
check require_fzf
check test -x "$HERDR_BIN_PATH"
check test -f "$VERIFY_CONFIG_DIR/config.toml"
check test -d "$VERIFY_PROJECTS_DIR/demo-app/.git"

if [[ -f "$VERIFY_HERDR_TRACE" ]]; then
  echo "OK  herdr trace present ($VERIFY_HERDR_TRACE)"
else
  echo "NOTE herdr trace not created yet (run a drive step)"
fi

version="$("$VERIFY_REPO_ROOT/dist/sessionizer" --help 2>&1 | head -1 || true)"
echo "INFO binary help starts: ${version:-unknown}"

exit "$fail"
