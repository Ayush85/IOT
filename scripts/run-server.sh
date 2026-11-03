#!/usr/bin/env bash
# Start the RuView sensing server (UI on http://localhost:${PORT:-3100}/ui/index.html; 3000 is used by Elvra).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SUBNET="${1:-192.168.1.0/24}"
# shellcheck disable=SC1091
[ -f "$ROOT/config/room.env" ] && { set -a; . "$ROOT/config/room.env"; set +a; }
mkdir -p "$ROOT/run" && cd "$ROOT/run"   # server writes data/ here
exec "$ROOT/vendor/RuView/v2/target/release/sensing-server" \
  --http-port "${PORT:-3100}" --ui-path "$ROOT/vendor/RuView/ui" \
  --source auto --udp-bind 0.0.0.0 --udp-allow "$SUBNET"
