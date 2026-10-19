#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"
verify_paths

cd "$VERIFY_REPO_ROOT"
if ! command -v bun >/dev/null 2>&1; then
  curl -fsSL https://bun.sh/install | bash
  # shellcheck source=/dev/null
  source "${HOME}/.bashrc"
fi

bun install --ignore-scripts
bun run build
if ! command -v fzf >/dev/null 2>&1; then
  if [[ ! -d /tmp/fzf ]]; then
    git clone --depth 1 https://github.com/junegunn/fzf.git /tmp/fzf
  fi
  /tmp/fzf/install --bin --no-update-rc --no-bash --no-fish --no-zsh
fi
if ! command -v fzf >/dev/null 2>&1 && [[ -x /tmp/fzf/bin/fzf ]]; then
  mkdir -p "${HOME}/.local/bin"
  cp /tmp/fzf/bin/fzf "${HOME}/.local/bin/fzf"
  export PATH="${HOME}/.local/bin:${PATH}"
fi
require_fzf
require_built_binary
"$(sessionizer_bin)" --help >/dev/null
echo "Launch OK: $(sessionizer_bin)"
