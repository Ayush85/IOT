#!/usr/bin/env bash
# Write WiFi credentials + host IP into the node's NVS (no reflash needed).
# Usage: scripts/provision.sh <ssid> [port] [target-ip]   (password is prompted)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SSID="${1:?usage: provision.sh <ssid> [port] [target-ip]}"
PORT="${2:-/dev/ttyACM0}"
IP="${3:-$(ip -4 route get 1.1.1.1 | awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}')}"
"$ROOT/.venv/bin/python" "$ROOT/vendor/RuView/firmware/esp32-csi-node/provision.py" \
  --port "$PORT" --ssid "$SSID" --target-ip "$IP"
