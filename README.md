# IOT – WiFi CSI Sensing with ESP32-S3

Personal project inspired by [ruvnet/RuView](https://github.com/ruvnet/RuView):
camera-free presence / motion / breathing sensing from WiFi Channel State Information (CSI).

## Hardware
- 2x ESP32-S3-DevKitC-1 style boards (ESP32-S3-N16R8: 16 MB flash, 8 MB PSRAM, 2x USB-C)
- 2.4 GHz WiFi router
- Laptop / Raspberry Pi as the host

## Architecture
```
 Router ──WiFi──> ESP32-S3 node(s) ──UDP (CSI frames)──> Host (laptop/Pi) ──> dashboard
```
Place nodes 2–4 m apart with the router; a person moving through the links changes the CSI.

## Layout
- `docs/setup.md` – step-by-step connection, flashing, validation
- `firmware/` – CSI node firmware (use RuView's `firmware/esp32-csi-node` or Espressif `esp-csi`)
- `scripts/udp_listen.py` – minimal UDP receiver to confirm frames arrive

## Status
- [x] Flash node 1, see CSI on serial
- [x] Provision WiFi + host IP, receive UDP on host
- [ ] Second node, compare links
- [ ] Run RuView sensing server against live data
