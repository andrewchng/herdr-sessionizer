#!/usr/bin/env bash
# Optional: record sessionizer-new-project drive via Xvfb + xterm + ffmpeg x11grab.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"
verify_paths
ensure_artifacts_dir
require_built_binary
require_fzf
require_tmux

if ! command -v Xvfb >/dev/null 2>&1; then
  echo "Xvfb required (sudo apt-get install -y xvfb xterm)" >&2
  exit 1
fi
if ! command -v xterm >/dev/null 2>&1; then
  echo "xterm required (sudo apt-get install -y xterm)" >&2
  exit 1
fi

OUT="${VERIFY_ARTIFACTS}/sessionizer-new-project.mp4"
DISPLAY_NUM="${VERIFY_XVFB_DISPLAY:-99}"
export DISPLAY=":${DISPLAY_NUM}"
GEOM="${VERIFY_XTERM_GEOM:-960x540}"

SUCCESS_RE="✓ workspace 'demo-app' created and focused"
PROJECT_PICKER_RE="Select a project to create a workspace"
SESSION="sessionizer-verify-mp4"

pkill -f "Xvfb :${DISPLAY_NUM}" 2>/dev/null || true
sleep 0.3
Xvfb ":${DISPLAY_NUM}" -screen 0 "${GEOM}x24" +extension RANDR &
XVFB_PID=$!
sleep 0.8

cleanup_x() {
  kill "$FF_PID" 2>/dev/null || true
  kill "$XTERM_PID" 2>/dev/null || true
  kill "$XVFB_PID" 2>/dev/null || true
  tmux_cmd kill-session -t "$SESSION" 2>/dev/null || true
}
trap cleanup_x EXIT

: >"$VERIFY_HERDR_TRACE"
reset_mock_herdr_state
tmux_cmd kill-session -t "$SESSION" 2>/dev/null || true
tmux_cmd new-session -d -s "$SESSION" -x 120 -y 40 -c "$VERIFY_REPO_ROOT"

TMUX_ATTACH="$(printf '%q ' "${VERIFY_TMUX[@]}")attach-session -t $SESSION"
xterm -display "$DISPLAY" -geometry 120x40+0+0 +sb \
  -bg '#1a1b26' -fg '#c0caf5' -fa 'DejaVu Sans Mono' -fs 12 \
  -title sessionizer-verify \
  -e bash -lc "$TMUX_ATTACH" &
XTERM_PID=$!
sleep 1.5

ffmpeg -y -loglevel error \
  -f x11grab -draw_mouse 0 -framerate 12 -video_size "$GEOM" -i "${DISPLAY}.0+0,0" \
  -c:v libx264 -preset ultrafast -crf 28 -pix_fmt yuv420p -t 45 \
  -movflags +faststart \
  "$OUT" &
FF_PID=$!
sleep 0.5

DRIVE_CMD="export HOME='$VERIFY_HOME' HERDR_PLUGIN_CONFIG_DIR='$VERIFY_CONFIG_DIR' HERDR_BIN_PATH='$HERDR_BIN_PATH' VERIFY_ROOT='$VERIFY_ROOT' VERIFY_PROJECTS_DIR='$VERIFY_PROJECTS_DIR' VERIFY_STATE='$VERIFY_STATE' VERIFY_HERDR_TRACE='$VERIFY_HERDR_TRACE' PATH='/tmp/fzf/bin:${HOME}/.local/bin:/exec-daemon:${PATH}'; ./dist/sessionizer sessionizer"

tmux_cmd send-keys -t "$SESSION" "$DRIVE_CMD" C-m
"$SCRIPT_DIR/wait-for-pane-text.sh" "$SESSION" "$PROJECT_PICKER_RE" 45
sleep 0.6
tmux_cmd send-keys -t "$SESSION" "demo-app" C-m
"$SCRIPT_DIR/wait-for-pane-text.sh" "$SESSION" "$SUCCESS_RE" 60
sleep 1.0

kill -INT "$FF_PID" 2>/dev/null || true
wait "$FF_PID" 2>/dev/null || true
FF_PID=

size=$(stat -c%s "$OUT" 2>/dev/null || stat -f%z "$OUT")
max=$((15 * 1024 * 1024))
if [[ "$size" -gt "$max" ]]; then
  echo "MP4 exceeds 15MB ($size bytes): $OUT" >&2
  exit 1
fi
if [[ "$size" -lt 10000 ]]; then
  echo "MP4 too small ($size bytes)" >&2
  exit 1
fi

echo "$OUT ($size bytes)"
