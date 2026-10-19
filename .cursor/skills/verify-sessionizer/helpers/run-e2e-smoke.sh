#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

"$SCRIPT_DIR/launch-build.sh"
"$SCRIPT_DIR/setup-fixtures.sh"
"$SCRIPT_DIR/doctor.sh"
"$SCRIPT_DIR/drive-sessionizer-new-project.sh"
"$SCRIPT_DIR/cleanup.sh"

# Confirm evidence survived cleanup
source "$SCRIPT_DIR/lib.sh"
verify_paths
test -f "$VERIFY_ARTIFACTS/sessionizer-new-project.png"
test -f "$VERIFY_ARTIFACTS/herdr-trace.log"
test -s "$VERIFY_ARTIFACTS/sessionizer-drive.log"
echo "E2E smoke passed"
