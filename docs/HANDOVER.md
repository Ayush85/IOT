# Handover: ESP32-S3 WiFi sensing room monitor

Status as of 2026-11-04, repo `Ayush85/IOT`, last commit `3b7fa64`. Everything described here is committed except the `vendor/` folder and local runtime state (see "What is not in git").

## 1. What this is

A room monitor built on two ESP32-S3 boards and [RuView](https://github.com/ruvnet/RuView) (an experimental, beta WiFi-sensing project). The boards read WiFi Channel State Information (CSI) from the router and stream it to a laptop. A RuView server on the laptop turns that into presence / motion, and our own dashboard (`ui-custom/command-center.html`) shows a room map, the two boards, a rough person marker, a people-count estimate and distances.

It senses **people and movement only**. It cannot identify objects. Furniture on the map is placed by hand.

## 2. What works, and what does not

| Item | State |
|---|---|
| Both boards flashed, joined WiFi, streaming CSI over UDP | **Working**, verified on the live stream |
| RuView sensing server, live stream at `/ws/sensing` | **Working** |
| Dashboard: map, nodes, status, distances (map-based) | **Working** (page renders with live data, no console errors) |
| Presence / motion detection | **Works** (it is what WiFi sensing is good at) |
| People count | **Unreliable.** The server's own count flipped between 1 and 2 with one person present. The dashboard smooths it but cannot make it correct |
| Person location, "Link model" method | **Rough** (about a metre-wide area at best); never checked against a real person |
| Person location, "Trained fingerprint" method | **Code written and tested on a simulated room only.** It has never been trained on real recordings, so its real accuracy is **unknown** |
| Empty-room calibration (RuView's own) | **Not completed.** Needs 10 minutes with the room empty. One attempt was cancelled; no calibration is active |
| Board-to-board distance | **Not measurable** by the boards (no ranging in the firmware). The dashboard shows the distance between positions you place on the map; the "Signal" column is a rough RSSI guess, off by 1–3 m or more |
| Pose / skeletons, heart rate, breathing | Not trustworthy. The `persons` list in the stream is placeholder data with zero-confidence keypoints |

## 3. Hardware and addresses

| | Board 1 | Board 2 |
|---|---|---|
| Chip | ESP32-S3-N16R8 (16 MB flash, 8 MB PSRAM) | same |
| MAC | `28:84:85:8a:1b:04` | `28:84:85:91:52:a8` |
| Node ID / time slot | 1 / slot 0 of 2 | 2 / slot 1 of 2 |
| IP | DHCP (was 192.168.1.86) | DHCP |

- WiFi: 2.4 GHz network `ALHN-2513` (router/AP at 192.168.1.254, channel 11). The boards store the credentials in flash (NVS). **The WiFi password was typed into a chat session during setup. Change it if that matters, then re-provision both boards.**
- Laptop (host) was at 192.168.1.72. The boards send UDP to that IP, port 5005. If the laptop's IP changes, re-provision with the new `--target-ip`.
- Each board has two USB-C ports. Use the one labelled COM/UART for flashing; the native USB port works but re-appears under a new device on every reset. Once flashed, the boards only need 5 V power.

## 4. How the pieces fit

```
router --WiFi--> ESP32 node 1 \                          /--> http://localhost:3100/ui/command-center.html
router --WiFi--> ESP32 node 2 /--UDP :5005--> sensing-server --WebSocket /ws/sensing--> dashboard
```

Each board measures only its own link to the router. The boards do not talk to each other, so there is no board-to-board data.

## 5. Repository map

| Path | Purpose |
|---|---|
| `scripts/run-server.sh` | Starts the RuView sensing server on port **3100** (3000 is used by another project, Elvra). Builds a merged UI folder `run/ui` from RuView's UI plus `ui-custom/`. Reads `config/room.env` |
| `scripts/flash.sh [port]` | Flashes the locally built firmware (bootloader, partition table, OTA data, app) |
| `scripts/provision.sh <ssid> [port] [ip]` | Writes WiFi + host IP to a board. It does **not** set node ID or TDM slot; see section 7 |
| `scripts/calibrate.sh` / `calibrate.py` | Empty-room calibration via the server API (see section 8) |
| `scripts/udp_listen.py [port]` | Prints raw UDP packets, to check a board is streaming |
| `config/room.env` | Node positions for the server (metres) |
| `ui-custom/command-center.html` | The dashboard (single file, no build step) |
| `ui-custom/fingerprint.js` | Fingerprint locator engine (also loadable in node) |
| `tests/fingerprint.test.js` | Simulation test: `node tests/fingerprint.test.js` |
| `docs/setup.md` | Original first-pass setup notes (partly superseded by this file) |
| `vendor/` (ignored) | Clone of RuView with submodules |

## 6. Run it

```bash
cd ~/Developments/IOT
scripts/run-server.sh            # background it, e.g. nohup scripts/run-server.sh &
# open http://localhost:3100/ui/command-center.html
curl localhost:3100/health       # expect "state":"live","source":"esp32"
```

The server stops when the laptop reboots or the process is killed; nothing starts it automatically yet. Ports: HTTP/UI on 3100 (loopback only); CSI UDP on 5005 (all interfaces, accepted only from 192.168.1.0/24). RuView's API auth is off, which is acceptable only because HTTP is loopback-only.

New files in `ui-custom/` are linked into `run/ui` when the server starts, so restart the server after adding one.

## 7. Rebuild from scratch

**RuView and server** (about 6 minutes to compile):
```bash
git clone --depth 1 https://github.com/ruvnet/RuView vendor/RuView
git -C vendor/RuView submodule update --init --depth 1     # required, or cargo fails on a missing crate
cd vendor/RuView/v2 && cargo build --release -p wifi-densepose-sensing-server
```

**Firmware** (ESP-IDF v5.4 in Docker; the prebuilt `release_bins` are labelled historical by the RuView docs). The `devkitc` overlay is required for display-less boards:
```bash
cd vendor/RuView
docker run --rm -v "$(pwd)/firmware/esp32-csi-node:/project" -w /project espressif/idf:v5.4 bash -c \
 "rm -rf build sdkconfig && idf.py -DSDKCONFIG_DEFAULTS='sdkconfig.defaults;sdkconfig.defaults.devkitc' set-target esp32s3 && idf.py -DSDKCONFIG_DEFAULTS='sdkconfig.defaults;sdkconfig.defaults.devkitc' build"
```
It builds with the 8 MB layout, which runs fine on these 16 MB chips.

**Python tooling:** `python3 -m venv .venv && .venv/bin/pip install esptool==5.6.0 esp-idf-nvs-partition-gen==0.3.0 pyserial websockets`

**Flash and provision** (board on COM port, example `/dev/ttyACM0`):
```bash
scripts/flash.sh /dev/ttyACM0
echo 'WIFI-PASSWORD' > pw && chmod 600 pw      # keep it out of shell history; delete afterwards
.venv/bin/python vendor/RuView/firmware/esp32-csi-node/provision.py --port /dev/ttyACM0 \
  --ssid ALHN-2513 --password-file pw --target-ip <laptop-ip> --node-id <1|2> --tdm-slot <0|1> --tdm-total 2
```
Use `provision.py` directly (not `provision.sh`) so node ID and TDM slot are set. Provisioning rewrites only the settings partition; it does not reflash the app.

## 8. Things that will bite you

- **Serial port permission.** The user was added to `dialout`, but open shells need a re-login to see it. Workarounds: `sg dialout -c "<command>"` or `sudo chmod 666 /dev/ttyACMx` (resets when the board re-enumerates).
- **`SENSING_NODE_POSITIONS` is indexed by node ID starting at 0.** With nodes 1 and 2 the value needs a placeholder first: `"0,0,0;x1,y1,z1;x2,y2,z2"`. Two entries silently map to IDs 0 and 1.
- **Positions exist in two places and do not sync.** The server uses `config/room.env`. The dashboard uses positions stored in the browser (drag a board on the map). The dashboard shows a line you can paste into `room.env`, then restart the server. The values currently in `room.env` and the dashboard are guesses, not measurements.
- **Dashboard data lives in the browser** (`localStorage`): room size, placed objects, board positions, training recordings, settings. It is per browser and not in git. Use Export to save a layout.
- **RuView calibration API** needs a lowercase SHA-256 room binding and the node ID list on `start`, and the returned `boot_epoch`, `session_id`, `binding_digest`, `source_node_ids` on `stop`/`cancel`. The server requires **600 s and 1000 frames** before `stop` succeeds. `scripts/calibrate.py` implements this and waits for the server's own targets, but **it has never run to completion**, so treat it as untested.
- **Training invalidates if a board moves.** Recordings for the fingerprint locator are tied to the boards' physical positions and the room. Move a board and you must clear and retrain.
- **Only about half of the stream messages carry amplitude data.** The dashboard averages frames, so this is handled, but anything new reading `nodes[].amplitude` must tolerate empty arrays.
- **`pkill -f` can kill your own shell** if the pattern appears in the command. Use `pkill -x sensing-server`.

## 9. Next steps, most valuable first

1. **Train the fingerprint locator** in the dashboard (Train location section): record the empty room, then 6–12 spots. Read the three accuracy numbers it shows. That tells you whether this approach is good enough.
2. **Measure and set real positions:** room size, router, and both boards (tape measure). Place the Router object on the map, then update `config/room.env`.
3. **Decide on the accuracy ceiling.** Two WiFi links cannot give a trustworthy headcount or precise position. If that is required, the realistic fixes are a third and fourth board, or a mmWave radar module (such as LD2450, about $5–10 each) wired to each ESP32. Camera-free precise tracking needs hardware beyond what you have.
4. Optional: run the 10-minute empty-room RuView calibration (`scripts/calibrate.sh 60`), leaving the room and the boards untouched.
5. Optional: make the server start at boot (systemd user service running `scripts/run-server.sh`).
6. Optional: board-to-board ranging with Wi-Fi FTM (ESP32-S3 supports it, about 1–2 m error at best) needs custom firmware; nothing exists yet.

## 10. What is not in git

- `vendor/` (RuView clone, built binaries and firmware build output): rebuild with section 7.
- `run/`, `data/`, `.venv/`: runtime and tooling, recreated automatically or by section 7.
- WiFi credentials: stored only on the boards.
- Dashboard settings and training data: browser `localStorage` (export to keep).
- Anything outside this repo that the laptop runs (the server process is a manual background job).
