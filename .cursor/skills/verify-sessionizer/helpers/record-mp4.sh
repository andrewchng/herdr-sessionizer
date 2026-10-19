#!/usr/bin/env bash
# Record sessionizer-new-project via Xvfb + xterm + ffmpeg (clean shell, watchable pacing).
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
# Virtual screen (must fit the xterm window; ffmpeg crops to xterm via xwininfo).
GEOM="${VERIFY_XTERM_GEOM:-960x780}"

pause() {
  sleep "${1:-1}"
}

resolve_xterm_window() {
  local wid=""
  for _ in $(seq 1 60); do
    wid="$(xdotool search --name 'sessionizer-verify' 2>/dev/null | head -1 || true)"
    [[ -n "$wid" ]] && break
    pause 0.1
  done
  if [[ -z "$wid" ]]; then
    echo "record-mp4: xterm window sessionizer-verify not found" >&2
    return 1
  fi
  GRAB_W=$(xwininfo -id "$wid" | awk '/Width:/{print $2; exit}')
  GRAB_H=$(xwininfo -id "$wid" | awk '/Height:/{print $2; exit}')
  # Clamp to Xvfb screen so x11grab stays in bounds.
  SCR_W="${GEOM%x*}"
  SCR_H="${GEOM#*x}"
  if (( GRAB_W > SCR_W )); then GRAB_W=$SCR_W; fi
  if (( GRAB_H > SCR_H )); then GRAB_H=$SCR_H; fi
  GRAB_X=$(xwininfo -id "$wid" | awk '/Absolute upper-left X:/{print $4; exit}')
  GRAB_Y=$(xwininfo -id "$wid" | awk '/Absolute upper-left Y:/{print $4; exit}')
  GRAB_INPUT="${DISPLAY}+${GRAB_X},${GRAB_Y}"
  GRAB_SIZE="${GRAB_W}x${GRAB_H}"
}

SUCCESS_RE="✓ workspace 'demo-app' created and focused"
PROJECT_PICKER_RE="Select a project to create a workspace"
SESSION="sessionizer-verify-mp4"
ENV_FILE="$("$SCRIPT_DIR/write-record-env.sh")"

FF_PID=""
XTERM_PID=""
XVFB_PID=""

pkill -f "Xvfb :${DISPLAY_NUM}" 2>/dev/null || true
sleep 0.3
Xvfb ":${DISPLAY_NUM}" -screen 0 "${GEOM}x24" +extension RANDR &
XVFB_PID=$!
sleep 0.8

cleanup_x() {
  [[ -n "$FF_PID" ]] && kill "$FF_PID" 2>/dev/null || true
  [[ -n "$XTERM_PID" ]] && kill "$XTERM_PID" 2>/dev/null || true
  [[ -n "$XVFB_PID" ]] && kill "$XVFB_PID" 2>/dev/null || true
  tmux_cmd kill-session -t "$SESSION" 2>/dev/null || true
}
trap cleanup_x EXIT

: >"$VERIFY_HERDR_TRACE"
reset_mock_herdr_state
tmux_cmd kill-session -t "$SESSION" 2>/dev/null || true
tmux_cmd new-session -d -s "$SESSION" -x 100 -y 44 -c "$VERIFY_REPO_ROOT"

# Configure env off-screen (before xterm attach / ffmpeg).
tmux_cmd send-keys -t "$SESSION" "source $(printf '%q' "$ENV_FILE") && clear" C-m
pause 0.6

TMUX_ATTACH="$(printf '%q ' "${VERIFY_TMUX[@]}")attach-session -t $SESSION"
xterm -display "$DISPLAY" -geometry 100x44+0+0 +sb \
  -bg '#1a1b26' -fg '#c0caf5' -fa 'DejaVu Sans Mono' -fs 10 \
  -title sessionizer-verify \
  -e bash -lc "$TMUX_ATTACH" &
XTERM_PID=$!
pause 1.2

tmux_cmd send-keys -t "$SESSION" C-l
pause 0.8
resolve_xterm_window

ffmpeg -y -loglevel error \
  -f x11grab -draw_mouse 0 -framerate 12 -video_size "$GRAB_SIZE" -i "$GRAB_INPUT" \
  -c:v libx264 -preset ultrafast -crf 28 -pix_fmt yuv420p -t 25 \
  -movflags +faststart \
  "$OUT" &
FF_PID=$!
pause 0.5
if ! kill -0 "$FF_PID" 2>/dev/null; then
  echo "record-mp4: ffmpeg failed to start (grab ${GRAB_SIZE} @ ${GRAB_INPUT})" >&2
  exit 1
fi

tmux_cmd send-keys -t "$SESSION" "./dist/sessionizer sessionizer" C-m
"$SCRIPT_DIR/wait-for-pane-text.sh" "$SESSION" "$PROJECT_PICKER_RE" 45
pause 2.0

for ch in d e m o; do
  tmux_cmd send-keys -t "$SESSION" "$ch"
  pause 0.45
done
pause 1.5

tmux_cmd send-keys -t "$SESSION" C-m
"$SCRIPT_DIR/wait-for-pane-text.sh" "$SESSION" "$SUCCESS_RE" 60
pause 3.0

kill -INT "$FF_PID" 2>/dev/null || true
wait "$FF_PID" 2>/dev/null || true
FF_PID=""

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

dur="$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$OUT" 2>/dev/null || echo 0)"
echo "$OUT ($size bytes, ${dur}s)"
