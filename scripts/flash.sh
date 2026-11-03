#!/usr/bin/env bash
# Flash the locally built RuView CSI firmware to an ESP32-S3.
# Usage: scripts/flash.sh [/dev/ttyACM0]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${1:-/dev/ttyACM0}"
B="$ROOT/vendor/RuView/firmware/esp32-csi-node/build"
PY="$ROOT/.venv/bin/python"
"$PY" -m esptool --chip esp32s3 --port "$PORT" chip-id
"$PY" -m esptool --chip esp32s3 --port "$PORT" --baud 460800 \
  write_flash --flash_mode dio --flash_size 8MB --flash_freq 80m \
  0x0     "$B/bootloader/bootloader.bin" \
  0x8000  "$B/partition_table/partition-table.bin" \
  0xf000  "$B/ota_data_initial.bin" \
  0x20000 "$B/esp32-csi-node.bin"
