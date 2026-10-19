#!/usr/bin/env bash
# Capture a tmux pane as PNG (renders last lines with Pillow — avoids blank caption bugs).
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

usage() {
  echo "Usage: capture-pane-png.sh <tmux-session> <output.png>" >&2
  exit 1
}

[[ $# -eq 2 ]] || usage
SESSION="$1"
OUT="$2"
verify_paths
ensure_artifacts_dir
mkdir -p "$(dirname "$OUT")"

TMPTXT="$(mktemp)"
tmux_cmd capture-pane -t "$SESSION" -e -J -p | sed -r 's/\x1B\[[0-9;]*[a-zA-Z]//g' | tail -n 40 >"$TMPTXT"
if [[ ! -s "$TMPTXT" ]]; then
  echo "capture-pane produced empty buffer for $SESSION" >&2
  exit 1
fi

python3 - "$TMPTXT" "$OUT" <<'PY'
import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", "pillow"])
    from PIL import Image, ImageDraw, ImageFont

src, out = sys.argv[1], sys.argv[2]
lines = Path(src).read_text().splitlines()
font_path = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"
font = ImageFont.truetype(font_path, 16)
line_h = 22
height = max(400, 40 + line_h * len(lines))
img = Image.new("RGB", (1600, height), (26, 27, 38))
draw = ImageDraw.Draw(img)
y = 20
for line in lines:
    draw.text((16, y), line[:140], fill=(192, 202, 245), font=font)
    y += line_h
img.save(out)
PY
rm -f "$TMPTXT"

size=$(stat -c%s "$OUT" 2>/dev/null || stat -f%z "$OUT")
if [[ "$size" -lt 8000 ]]; then
  echo "PNG too small ($size bytes), likely blank: $OUT" >&2
  exit 1
fi
echo "$OUT ($size bytes)"
