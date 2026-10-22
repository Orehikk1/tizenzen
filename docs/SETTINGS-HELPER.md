# Settings helper (optional)

Samsung does not let a TV app open its Settings (PITFALLS #4), but the TV accepts a remote-control
key over the network. `tools/keyhelper.py` is a tiny web server that presses **Settings** (`/menu`)
or **Source** (`/source`) when TizenZen asks. It must run on an always-on machine on the same
network (home server, Raspberry Pi, NAS), and nothing else is accepted.

1. On that machine, pair once (the person presses Allow on the TV):
   `TV_IP=<tv-ip> python3 tools/tvkey.py --pair`  → writes `tools/tv-remote-token` (git-ignored).
   If Home Assistant runs on that same machine and already has the TV, its token works too
   (`TV_CLIENT_NAME=HomeAssistant`), with the person's permission.
2. Start it, and keep it running (cron `@reboot`, systemd, or Docker):
   `TV_IP=<tv-ip> python3 tools/keyhelper.py` (listens on port 8787)
3. Check: `curl http://<server>:8787/menu` → Settings opens on the TV.
4. In `app/config.local.js`: `Q.keyHelper = 'http://<server>:8787';` and deploy again.

The Settings menu opens on top of TizenZen; Back returns to it.
