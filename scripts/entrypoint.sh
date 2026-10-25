#!/bin/sh
set -eu
export DISPLAY="${DISPLAY:-:99}"
Xvfb "$DISPLAY" -screen 0 1280x720x24 -nolisten tcp &
# Xvfb creates the socket once it is ready. Bound the wait and fail visibly.
attempt=0
while [ ! -S "/tmp/.X11-unix/X${DISPLAY#:}" ]; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 100 ]; then echo "Xvfb did not become ready" >&2; exit 1; fi
  sleep 0.1
done
exec "$@"
