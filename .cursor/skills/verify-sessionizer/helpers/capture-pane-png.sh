#!/usr/bin/env bash
# Capture a tmux pane as PNG. Optionally require text in scrollback before capture.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

usage() {
  echo "Usage: capture-pane-png.sh <tmux-session> <output.png> [--require REGEX] [--extract visible|success-context]" >&2
  exit 1
}

[[ $# -ge 2 ]] || usage
SESSION="$1"
OUT="$2"
shift 2
REQUIRE=""
EXTRACT="visible"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --require)
      REQUIRE="${2:-}"
      shift 2
      ;;
    --extract)
      EXTRACT="${2:-visible}"
      shift 2
      ;;
    *)
      usage
      ;;
  esac
done

verify_paths
ensure_artifacts_dir
mkdir -p "$(dirname "$OUT")"

if [[ -n "$REQUIRE" ]]; then
  "$SCRIPT_DIR/wait-for-pane-text.sh" "$SESSION" "$REQUIRE" 60
fi

FULL="$(mktemp)"
tmux_cmd capture-pane -t "$SESSION" -S -32000 -E - -p | sed -r 's/\x1B\[[0-9;]*[a-zA-Z]//g' >"$FULL"

if [[ -n "$REQUIRE" ]] && ! grep -qF "$REQUIRE" "$FULL"; then
  echo "capture-pane-png: required pattern /$REQUIRE/ missing from scrollback" >&2
  exit 1
fi

TMPTXT="$(mktemp)"
case "$EXTRACT" in
  success-context)
    # Center PNG on the success line, not the empty tail of the pane.
    python3 - "$FULL" "$REQUIRE" "$TMPTXT" <<'PY'
import sys
from pathlib import Path

full, pattern, out = sys.argv[1], sys.argv[2], sys.argv[3]
lines = Path(full).read_text().splitlines()
idx = None
for i, line in enumerate(lines):
    if pattern in line:
        idx = i
start = max(0, (idx or 0) - 8)
chunk = lines[start : (idx or len(lines)) + 6]
if not chunk:
    chunk = lines[-35:]
Path(out).write_text("\n".join(chunk) + "\n")
PY
    ;;
  visible)
    tail -n 40 "$FULL" >"$TMPTXT"
    ;;
  *)
    echo "unknown extract mode: $EXTRACT" >&2
    exit 1
    ;;
esac

if [[ ! -s "$TMPTXT" ]]; then
  echo "capture-pane-png: nothing to render" >&2
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

rm -f "$FULL" "$TMPTXT"

size=$(stat -c%s "$OUT" 2>/dev/null || stat -f%z "$OUT")
if [[ "$size" -lt 8000 ]]; then
  echo "PNG too small ($size bytes), likely blank: $OUT" >&2
  exit 1
fi

echo "$OUT ($size bytes)"
