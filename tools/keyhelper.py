#!/usr/bin/env python3
"""TizenZen key helper: presses TV remote buttons that a TV app itself is not allowed to open.

Samsung doesn't let normal apps open its Settings, so TizenZen calls http://<server>:8787/menu
and this presses the remote's Settings key over the TV's websocket (port 8002).
Run it on an always-on machine (home server, Pi). Only the fixed actions below are accepted.

Environment:
  TV_IP          the TV's address (required)
  TV_TOKEN_FILE  file holding a pairing token for this machine (default: ./tv-remote-token)
  TV_CLIENT_NAME name the token was paired under (default: TizenZen; Home Assistant uses HomeAssistant)
A token is bound to the machine that paired, so pair from the machine that runs this.
Get one with: python3 tvkey.py --pair   (accept the popup on the TV).
"""
import base64
import json
import os
import socket
import ssl
import struct
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

TV, TV_PORT = os.environ.get("TV_IP", ""), 8002
LISTEN_PORT = 8787
ACTIONS = {"/menu": "KEY_MENU", "/source": "KEY_SOURCE"}
TOKEN_FILE = os.environ.get("TV_TOKEN_FILE", os.path.join(os.path.dirname(os.path.abspath(__file__)), "tv-remote-token"))
CLIENT_NAME = os.environ.get("TV_CLIENT_NAME", "TizenZen")


def ws_frame(text):
    data = text.encode()
    mask = os.urandom(4)
    n = len(data)
    head = bytes([0x81]) + (bytes([0x80 | n]) if n < 126 else bytes([0x80 | 126]) + struct.pack(">H", n))
    return head + mask + bytes(b ^ mask[i % 4] for i, b in enumerate(data))


def ws_read(sock):
    h = sock.recv(2)
    n = h[1] & 0x7F
    if n == 126:
        n = struct.unpack(">H", sock.recv(2))[0]
    elif n == 127:
        n = struct.unpack(">Q", sock.recv(8))[0]
    buf = b""
    while len(buf) < n:
        buf += sock.recv(n - len(buf))
    return buf.decode(errors="replace")


def press(key):
    token = open(TOKEN_FILE).read().strip()
    name = base64.b64encode(CLIENT_NAME.encode()).decode()
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    sock = ctx.wrap_socket(socket.create_connection((TV, TV_PORT), timeout=5))
    try:
        path = f"/api/v2/channels/samsung.remote.control?name={name}&token={token}"
        sock.send((f"GET {path} HTTP/1.1\r\nHost: {TV}:{TV_PORT}\r\nUpgrade: websocket\r\n"
                   f"Connection: Upgrade\r\nSec-WebSocket-Key: {base64.b64encode(os.urandom(16)).decode()}\r\n"
                   "Sec-WebSocket-Version: 13\r\n\r\n").encode())
        sock.recv(4096)
        if json.loads(ws_read(sock)).get("event") != "ms.channel.connect":
            return False
        sock.send(ws_frame(json.dumps({"method": "ms.remote.control", "params": {
            "Cmd": "Click", "DataOfCmd": key, "Option": "false", "TypeOfRemote": "SendRemoteKey"}})))
        time.sleep(0.3)
        return True
    finally:
        sock.close()


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        key = ACTIONS.get(self.path)
        ok = False
        if key:
            try:
                ok = press(key)
            except Exception:
                ok = False
        self.send_response(200 if ok else 404 if not key else 502)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(b"ok" if ok else b"no")

    def log_message(self, fmt, *args):
        print(time.strftime("%Y-%m-%d %H:%M:%S"), self.path, flush=True)


if __name__ == "__main__":
    if not TV:
        raise SystemExit("set TV_IP")
    ThreadingHTTPServer(("0.0.0.0", LISTEN_PORT), Handler).serve_forever()
