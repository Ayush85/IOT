#!/usr/bin/env python3
"""Empty-room calibration for the RuView sensing server.
Usage: calibrate.py [grace_s=60] [unused] [source_node=1] [nodes=1,2]
Leave the room (and don't touch the boards) during the grace period AND the recording."""
import hashlib, json, os, sys, time, urllib.request, urllib.error

grace = int(sys.argv[1]) if len(sys.argv) > 1 else 60
rec = int(sys.argv[2]) if len(sys.argv) > 2 else 60
src = int(sys.argv[3]) if len(sys.argv) > 3 else 1
nodes = sorted({int(x) for x in (sys.argv[4] if len(sys.argv) > 4 else "1,2").split(",")})
base = f"http://localhost:{os.environ.get('PORT', '3100')}/api/v1/calibration"

def call(path, body=None):
    req = urllib.request.Request(base + path, data=None if body is None else json.dumps(body).encode(),
                                 headers={"content-type": "application/json"}, method="GET" if body is None else "POST")
    try:
        with urllib.request.urlopen(req, timeout=15) as r: return json.load(r)
    except urllib.error.HTTPError as e: return {"success": False, "http": e.code, "body": e.read()[:300].decode(errors="replace")}

print(f"Leave the room now. Recording starts in {grace}s.", flush=True)
time.sleep(grace)
digest = hashlib.sha256(b"iot-room-1").hexdigest()
start = call(f"/start?source_node_id={src}", {"binding_digest": digest, "source_node_ids": nodes})
print(time.strftime("%T"), "start:", {k: start.get(k) for k in ("success", "message", "error", "error_code", "status")}, flush=True)
if not start.get("success"): sys.exit(1)
ident = {k: start[k] for k in ("boot_epoch", "session_id", "binding_digest", "source_node_ids")}
# The server sets its own targets (min_duration_s / min_frames); wait for them instead of guessing.
while True:
    st = call("/status")
    need_s, need_f = st.get("min_duration_s", 600), st.get("min_frames", 1000)
    done = st.get("elapsed_s", 0) >= need_s and st.get("frame_count", 0) >= need_f
    print(f"  {st.get('elapsed_s', 0):.0f}/{need_s:.0f}s  {st.get('frame_count', 0)}/{need_f} frames", flush=True)
    if done: break
    time.sleep(30)
stop = call("/stop", ident)
print(time.strftime("%T"), "stop:", json.dumps({k: stop.get(k) for k in ("success", "error", "error_code", "status", "frame_count", "message")}), flush=True)
st = call("/status")
print("status:", {k: st.get(k) for k in ("active", "frame_count", "elapsed_s", "frames_per_second", "status")}, flush=True)
print("Done. You can come back in." if stop.get("success") else "Calibration did NOT complete.")
