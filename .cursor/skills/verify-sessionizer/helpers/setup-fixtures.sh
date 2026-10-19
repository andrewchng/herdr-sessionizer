#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"
verify_paths
ensure_artifacts_dir

rm -rf "$VERIFY_ROOT"
mkdir -p "$VERIFY_HOME" "$VERIFY_CONFIG_DIR" "$VERIFY_PROJECTS_DIR" "$VERIFY_ARTIFACTS"

# Scratch git repo for discovery + worktree flows
demo="${VERIFY_PROJECTS_DIR}/demo-app"
mkdir -p "$demo"
git -C "$demo" init -q
git -C "$demo" config user.email "verify@sessionizer.local"
git -C "$demo" config user.name "Sessionizer Verify"
cat >"$demo/README.md" <<'EOF'
# demo-app

Scratch fixture repo for verify-sessionizer.

- Used by fzf project picker previews (`head README.md` when bat is absent)
- Safe to delete; lives under `/tmp/sessionizer-verify-*`
EOF
git -C "$demo" add README.md
git -C "$demo" commit -q -m "init"

second="${VERIFY_PROJECTS_DIR}/other-repo"
mkdir -p "$second"
git -C "$second" init -q
git -C "$second" config user.email "verify@sessionizer.local"
git -C "$second" config user.name "Sessionizer Verify"
echo "# other" >"$second/README.md"
git -C "$second" add README.md
git -C "$second" commit -q -m "init"

reset_mock_herdr_state

cat >"$VERIFY_CONFIG_DIR/config.toml" <<EOF
[projects]
roots = ["${VERIFY_PROJECTS_DIR}"]
git_only = true
depth = 1

[ui]
placement = "overlay"

[worktree]
github_prs = false

[layout]
focus = "shell"

[tabs.dev]
label = "dev"

[[tabs.dev.panes]]
id = "shell"
title = "shell"
command = "bash -lc 'echo sessionizer-layout-ok; exec bash'"
EOF

echo "VERIFY_ROOT=$VERIFY_ROOT"
echo "VERIFY_CONFIG_DIR=$VERIFY_CONFIG_DIR"
echo "VERIFY_ARTIFACTS=$VERIFY_ARTIFACTS"
