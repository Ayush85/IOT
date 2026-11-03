# Setup steps

## 1. Connect the boards
Each board has two USB-C ports:
- **UART / "COM" port** (next to the board edge, via the USB-serial chip): use this for flashing and serial logs. Most reliable.
- **USB / native port**: ESP32-S3 native USB (JTAG/CDC). Works too, but may need BOOT held.

Plug the UART port into your laptop with a data-capable cable.
```
ls /dev/ttyUSB* /dev/ttyACM*
sudo usermod -aG dialout $USER   # then log out/in
```
If flashing fails: hold **BOOT**, tap **RST**, release BOOT, retry.

## 2. Tools
```
python3 -m venv .venv && source .venv/bin/activate
pip install esptool pyserial
```
For building firmware yourself install ESP-IDF 5.x (https://docs.espressif.com/projects/esp-idf) and run `idf.py set-target esp32s3`.

## 3. Get firmware
Easiest: clone RuView and use its `firmware/esp32-csi-node` (follow its README for the exact
esptool flash command and `provision.py`).
```
git clone https://github.com/ruvnet/RuView ~/RuView
```
Alternative: Espressif `esp-csi` examples (`get-started/csi_recv_router`).
Verify against the RuView README, since it is beta and commands may change.

## 4. Flash and provision
1. Flash bootloader + partition table + app with esptool (per RuView docs), chip `esp32s3`, 16 MB flash.
2. Provision: WiFi SSID, password (2.4 GHz only), and **host IP + UDP port**.
3. Monitor serial: `python -m serial.tools.miniterm /dev/ttyUSB0 115200` and look for CSI lines.

## 5. Host
```
python scripts/udp_listen.py 5005
```
Find your host IP with `ip a` and make sure laptop and ESP32 are on the same network/VLAN.
Then run the RuView sensing server (Docker demo or from source) pointing at the same port.

## 6. Validate
Empty room → person enters → sits still → walks across the link → door opens with nobody.
Add the 2nd node after one node works.

## Troubleshooting
- No port: bad cable (charge-only) or missing dialout group.
- No UDP: firewall (`sudo ufw allow 5005/udp`), wrong host IP, 5 GHz SSID.
