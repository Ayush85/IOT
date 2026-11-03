#!/usr/bin/env bash
# Start the RuView sensing server (UI on http://localhost:${PORT:-3100}; 3000 is used by Elvra).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SUBNET="${1:-192.168.1.0/24}"
exec "$ROOT/vendor/RuView/v2/target/release/sensing-server" \
  --http-port "${PORT:-3100}" --source auto --udp-bind 0.0.0.0 --udp-allow "$SUBNET"
