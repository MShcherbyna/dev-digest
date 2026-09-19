#!/bin/bash
# Usage: duration-hook.sh start|pause|resume|stop
# start  (UserPromptSubmit): remember when the turn began, reset paused time.
# pause  (PermissionRequest): a permission dialog opened, the user is being waited on.
# resume (PostToolUse/PostToolUseFailure): the tool ran, so the wait (if any) is over.
# stop   (Stop): open the video only if active time (excluding waits) exceeds THRESHOLD seconds.
THRESHOLD=120
URL='https://www.youtube.com/watch?v=EIXctSrNxWA&list=RDEIXctSrNxWA&start_radio=1'

session_id=$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("session_id","default"))' 2>/dev/null || echo default)
base="${TMPDIR:-/tmp}/claude-turn-$session_id"
now=$(date +%s)

# Adds the currently open pause (if any) to the paused total.
close_pause() {
  if [ -f "$base.pause" ]; then
    total=$(cat "$base.paused" 2>/dev/null || echo 0)
    echo $(( total + now - $(cat "$base.pause") )) > "$base.paused"
    rm -f "$base.pause"
  fi
}

case "$1" in
  start)
    echo "$now" > "$base.start"
    echo 0 > "$base.paused"
    rm -f "$base.pause"
    ;;
  pause)
    [ -f "$base.start" ] && [ ! -f "$base.pause" ] && echo "$now" > "$base.pause"
    ;;
  resume)
    close_pause
    ;;
  stop)
    [ -f "$base.start" ] || exit 0
    close_pause
    elapsed=$(( now - $(cat "$base.start") - $(cat "$base.paused" 2>/dev/null || echo 0) ))
    rm -f "$base.start" "$base.paused" "$base.pause"
    if [ "$elapsed" -gt "$THRESHOLD" ]; then
      open "$URL" >/dev/null 2>&1 || true
    fi
    ;;
esac
exit 0
