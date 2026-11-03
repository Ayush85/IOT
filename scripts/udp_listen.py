#!/usr/bin/env python3
"""Print incoming UDP packets so you can confirm an ESP32 node is streaming."""
import socket
import sys

port = int(sys.argv[1]) if len(sys.argv) > 1 else 5005
sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
sock.bind(("0.0.0.0", port))
print(f"listening on udp/{port}")
while True:
    data, addr = sock.recvfrom(4096)
    print(addr[0], len(data), "bytes", data[:60])
