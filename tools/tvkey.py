#!/usr/bin/env python3
"""Press Samsung TV remote keys over the network (stdlib only). Useful for self-testing.

  TV_IP=192.168.1.50 python3 tvkey.py --pair            pair once (accept the popup on the TV),
                                                       saves the token to ./tv-remote-token
  TV_IP=... python3 tvkey.py KEY_HOME 1500 KEY_ENTER    keys; a number waits that many ms
  TV_IP=... python3 tvkey.py HOLD:KEY_RETURN:2000       long press (Samsung "exit app")
  TV_IP=... python3 tvkey.py APP:<appId>:DEEP_LINK      ask the TV to launch an app

Notes (see docs/PITFALLS.md): the token is bound to the machine that paired; if no popup appears,
check Settings > General > External Device Manager > Device Connection Manager. A token that
Home Assistant already has works too, but only from the Home Assistant machine, with
TV_CLIENT_NAME=HomeAssistant.
"""
import base64, json, os, socket, ssl, struct, sys, time

TV, PORT = os.environ.get("TV_IP", ""), 8002
HERE = os.path.dirname(os.path.abspath(__file__))
TOKEN_FILE = os.environ.get("TV_TOKEN_FILE", os.path.join(HERE, "tv-remote-token"))
NAME = base64.b64encode(os.environ.get("TV_CLIENT_NAME", "TizenZen").encode()).decode()


def frame(text):
    data, mask = text.encode(), os.urandom(4)
    n = len(data)
    head = bytes([0x81]) + (bytes([0x80 | n]) if n < 126 else bytes([0x80 | 126]) + struct.pack(">H", n))
    return head + mask + bytes(b ^ mask[i % 4] for i, b in enumerate(data))


def read_msg(s):
    h = s.recv(2)
    n = h[1] & 0x7F
    if n == 126:
        n = struct.unpack(">H", s.recv(2))[0]
    elif n == 127:
        n = struct.unpack(">Q", s.recv(8))[0]
    buf = b""
    while len(buf) < n:
        buf += s.recv(n - len(buf))
    return json.loads(buf.decode(errors="replace"))


def connect(token, timeout):
    ctx = ssl.create_default_context()
    ctx.check_hostname, ctx.verify_mode = False, ssl.CERT_NONE
    s = ctx.wrap_socket(socket.create_connection((TV, PORT), timeout=timeout))
    path = f"/api/v2/channels/samsung.remote.control?name={NAME}" + (f"&token={token}" if token else "")
    s.send((f"GET {path} HTTP/1.1\r\nHost: {TV}:{PORT}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {base64.b64encode(os.urandom(16)).decode()}\r\nSec-WebSocket-Version: 13\r\n\r\n").encode())
    s.recv(4096)
    return s


def main():
    if not TV:
        sys.exit("set TV_IP")
    if sys.argv[1:] == ["--pair"]:
        print("Accept the popup on the TV (waiting up to 60 s)...")
        msg = read_msg(connect(None, 60))
        token = (msg.get("data") or {}).get("token")
        if msg.get("event") != "ms.channel.connect" or not token:
            sys.exit(f"no token ({msg.get('event')}); see docs/PITFALLS.md 'pairing popup never appears'")
        with open(TOKEN_FILE, "w") as f:
            f.write(token)
        os.chmod(TOKEN_FILE, 0o600)
        return print("paired, token saved to", TOKEN_FILE)
    token = open(TOKEN_FILE).read().strip() if os.path.exists(TOKEN_FILE) else None
    s = connect(token, 10)
    if read_msg(s).get("event") != "ms.channel.connect":
        sys.exit("TV did not accept the connection (pair first, from this machine)")

    def key(cmd, k):
        s.send(frame(json.dumps({"method": "ms.remote.control", "params": {
            "Cmd": cmd, "DataOfCmd": k, "Option": "false", "TypeOfRemote": "SendRemoteKey"}})))

    for step in sys.argv[1:]:
        if step.isdigit():
            time.sleep(int(step) / 1000)
        elif step.startswith("HOLD:"):
            _, k, ms = step.split(":")
            key("Press", k); time.sleep(int(ms) / 1000); key("Release", k)
        elif step.startswith("APP:"):
            _, app, kind = step.split(":")
            s.send(frame(json.dumps({"method": "ms.channel.emit", "params": {
                "event": "ed.apps.launch", "to": "host", "data": {"appId": app, "action_type": kind}}})))
        else:
            key("Click", step)
        print("sent", step)
        time.sleep(0.4)
    s.close()


if __name__ == "__main__":
    main()
