#!/usr/bin/env bash
# Shared Xvfb + xterm + ffmpeg recording (source from record-mp4-*.sh).
RECORD_HELPERS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$RECORD_HELPERS_DIR/lib.sh"

record_pause() {
  sleep "${1:-1}"
}

record_resolve_xterm_window() {
  local title="${RECORD_XTERM_TITLE:?}"
  local wid=""
  for _ in $(seq 1 60); do
    wid="$(xdotool search --name "$title" 2>/dev/null | head -1 || true)"
    [[ -n "$wid" ]] && break
    record_pause 0.1
  done
  if [[ -z "$wid" ]]; then
    echo "record-lib: xterm window '$title' not found" >&2
    return 1
  fi
  RECORD_GRAB_W=$(xwininfo -id "$wid" | awk '/Width:/{print $2; exit}')
  RECORD_GRAB_H=$(xwininfo -id "$wid" | awk '/Height:/{print $2; exit}')
  local scr_w="${RECORD_GEOM%x*}"
  local scr_h="${RECORD_GEOM#*x}"
  if (( RECORD_GRAB_W > scr_w )); then RECORD_GRAB_W=$scr_w; fi
  if (( RECORD_GRAB_H > scr_h )); then RECORD_GRAB_H=$scr_h; fi
  RECORD_GRAB_X=$(xwininfo -id "$wid" | awk '/Absolute upper-left X:/{print $4; exit}')
  RECORD_GRAB_Y=$(xwininfo -id "$wid" | awk '/Absolute upper-left Y:/{print $4; exit}')
  RECORD_GRAB_INPUT="${DISPLAY}+${RECORD_GRAB_X},${RECORD_GRAB_Y}"
  RECORD_GRAB_SIZE="${RECORD_GRAB_W}x${RECORD_GRAB_H}"
}

record_cleanup() {
  [[ -n "${RECORD_FF_PID:-}" ]] && kill "$RECORD_FF_PID" 2>/dev/null || true
  [[ -n "${RECORD_XTERM_PID:-}" ]] && kill "$RECORD_XTERM_PID" 2>/dev/null || true
  [[ -n "${RECORD_XVFB_PID:-}" ]] && kill "$RECORD_XVFB_PID" 2>/dev/null || true
  [[ -n "${RECORD_TMUX_SESSION:-}" ]] && tmux_cmd kill-session -t "$RECORD_TMUX_SESSION" 2>/dev/null || true
}

record_start_session() {
  local session="$1"
  local title="$2"
  local out="$3"
  RECORD_TMUX_SESSION="$session"
  RECORD_XTERM_TITLE="$title"
  RECORD_OUT="$out"
  RECORD_DISPLAY_NUM="${VERIFY_XVFB_DISPLAY:-99}"
  export DISPLAY=":${RECORD_DISPLAY_NUM}"
  RECORD_GEOM="${VERIFY_XTERM_GEOM:-960x780}"

  verify_paths
  ensure_artifacts_dir
  require_built_binary
  require_fzf
  require_tmux

  pkill -f "Xvfb :${RECORD_DISPLAY_NUM}" 2>/dev/null || true
  record_pause 0.3
  Xvfb ":${RECORD_DISPLAY_NUM}" -screen 0 "${RECORD_GEOM}x24" +extension RANDR &
  RECORD_XVFB_PID=$!
  record_pause 0.8
  trap record_cleanup EXIT

  tmux_cmd kill-session -t "$session" 2>/dev/null || true
  tmux_cmd new-session -d -s "$session" -x 100 -y 44 -c "$VERIFY_REPO_ROOT"
  tmux_apply_record_env "$session"
  record_pause 0.6

  local attach
  attach="$(printf '%q ' "${VERIFY_TMUX[@]}")attach-session -t $session"
  xterm -display "$DISPLAY" -geometry 100x44+0+0 +sb \
    -bg '#1a1b26' -fg '#c0caf5' -fa 'DejaVu Sans Mono' -fs 10 \
    -title "$title" \
    -e bash -lc "$attach" &
  RECORD_XTERM_PID=$!
  record_pause 1.2
  tmux_cmd send-keys -t "$session" C-l
  record_pause 0.8
  record_resolve_xterm_window

  ffmpeg -y -loglevel error \
    -f x11grab -draw_mouse 0 -framerate 12 -video_size "$RECORD_GRAB_SIZE" -i "$RECORD_GRAB_INPUT" \
    -c:v libx264 -preset ultrafast -crf 28 -pix_fmt yuv420p -t 30 \
    -movflags +faststart \
    "$out" &
  RECORD_FF_PID=$!
  record_pause 0.5
  if ! kill -0 "$RECORD_FF_PID" 2>/dev/null; then
    echo "record-lib: ffmpeg failed (grab ${RECORD_GRAB_SIZE} @ ${RECORD_GRAB_INPUT})" >&2
    exit 1
  fi
}

record_stop() {
  kill -INT "$RECORD_FF_PID" 2>/dev/null || true
  wait "$RECORD_FF_PID" 2>/dev/null || true
  RECORD_FF_PID=""
  local size
  size=$(stat -c%s "$RECORD_OUT" 2>/dev/null || stat -f%z "$RECORD_OUT")
  local max=$((15 * 1024 * 1024))
  if [[ "$size" -gt "$max" ]] || [[ "$size" -lt 10000 ]]; then
    echo "record-lib: bad MP4 size ($size bytes): $RECORD_OUT" >&2
    exit 1
  fi
  local dur
  dur="$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$RECORD_OUT" 2>/dev/null || echo 0)"
  echo "$RECORD_OUT ($size bytes, ${dur}s)"
}
