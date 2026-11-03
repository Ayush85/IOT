#!/usr/bin/env bash
# Empty-room calibration; see calibrate.py for args.
exec "$(dirname "$0")/../.venv/bin/python" -I "$(dirname "$0")/calibrate.py" "$@"
