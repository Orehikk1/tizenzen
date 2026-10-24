# Pitfalls: where we got stuck, and how to check each one yourself

Found on a Samsung UE65TU7022 (2020, Tizen 5.5) while building TizenZen with Claude. Each entry has
the symptom you will see, the cause, what TizenZen does about it, and a command to verify it on
your TV instead of trusting this file. Newer firmware may differ; when it does, add a note.

---

### 1. Nothing can replace the Home button
**Symptom:** Home always opens Samsung's bar. No setting, privilege or developer trick changes it.
**Cause:** Samsung keeps Home for its own launcher; there is no public way to set another.
**What TizenZen does:** a background service (`app/service/index.js`) notices when Samsung's screen
covers TizenZen and reopens it. It starts at boot and restarts itself.
**Verify:** `tools/status.sh` shows `reopened: covered without an app` a few seconds after you press
Home on TizenZen (`python3 tools/tvkey.py KEY_HOME`).

### 2. Home pressed *inside YouTube* cannot be detected
**Symptom:** in YouTube, Home shows Samsung's bar over the video and TizenZen does not come back.
**Cause:** the bar is an overlay. YouTube keeps reporting `"visible":true`, and the bar itself is not
visible to apps (not in the local API, not in `tizen.application.getAppsContext()`, no status events).
**What works instead:** **long-press Back** (Samsung's "exit app"): YouTube closes, TizenZen returns in ~2 s.
**Verify:** open YouTube, `tvkey.py KEY_HOME`, then `curl :8001/api/v2/applications/111299001912`:
still `"visible":true`. Then `tvkey.py HOLD:KEY_RETURN:2000` and `status.sh` shows `reopened: left`.

### 3. The same app has two ids
**Symptom:** you open YouTube by its Tizen id and the local API says `"running":false,"visible":false`
for that id, forever. The watcher then thinks nothing is on screen and takes the screen back.
**Cause:** preinstalled apps are known to the local API (port 8001) by their **Smart Hub number**,
but are launched by their **Tizen id**.
**Known pairs (2020 EU firmware):**

| App | Tizen id (`id`, to open) | Smart Hub id (`status`, to watch) |
|---|---|---|
| YouTube | `9Ur5IzDKqV.TizenYouTube` | `111299001912` |
| Netflix | `org.tizen.netflix-app` | `3201907018807` |
| Spotify | `rJeHak5zRg.Spotify` | `3201606009684` |
| Internet | `com.samsung.tv.knox-browser` | `3201907018784` |
| Jellyfin (sideloaded) | `AprZAARz4r.Jellyfin` | same |

**Verify:** open the app, then `curl http://<tv>:8001/api/v2/applications/<id>` for both ids; only the
right one says `"visible":true`.

### 4. Apps cannot open Samsung's own screens
**Symptom:** a tile that launches Settings (`com.samsung.tv.coba.setting`), Source
(`com.samsung.tv.coba.source`) or Apps (`com.samsung.tv.coba.apps`, `org.volt.apps`) does nothing.
No error callback either. `sdb shell 0 execute <id>` *does* open them, which is misleading:
that runs with developer rights, the app does not have them.
**What TizenZen does:** Sources = its own HDMI picker (#7). Apps = its own short list (`moreApps`).
Settings = optional key helper that presses the remote's Settings key (docs/SETTINGS-HELPER.md);
the Settings menu then opens on top of TizenZen, so Back lands on TizenZen.
**Verify:** `tvkey.py KEY_MENU` opens Settings; a tile with `tizen.application.launch('com.samsung.tv.coba.setting')` does not.

### 5. "Powered on" takes a minute to notice
**Symptom:** after the remote's Power button, Samsung's screen shows for about a minute before TizenZen.
**Cause:** Power usually means standby, not boot, so `on-boot` does not fire; and the local API
(port 8001) needs about a minute to come back after wake, so polling it is slow.
**What TizenZen does:** the service's timers freeze in standby; a gap of more than 5 s between ticks
means "just woke", and it opens TizenZen at once (and again at +4 s and +10 s) with the Tizen API.
**Verify:** person presses Power; `status.sh` shows `TV woke up` then `reopened: wake` within a second.

### 6. The watcher steals the screen from slow apps
**Symptom:** open Jellyfin (or YouTube) and TizenZen jumps back over it after a few seconds.
**Cause:** apps take 1 to 4 s to report themselves as running/visible.
**What TizenZen does:** reclaims only after nothing has been on screen for 6 s (`COVER_GRACE_MS`),
and treats an app that is gone for 0.8 s as "left" (`LEAVE_GRACE_MS`).
**Verify:** `tools/selftest.sh <status ids>` prints PASS. Before the fix it failed exactly here.

### 7. HDMI inputs: pass the TV's own object
**Symptom:** `tizen.tvwindow.setSource(...)` fails with
`Cannot convert [object Object] to SystemInfoVideoSourceInfo`.
**Cause:** it only accepts the object returned by `tizen.systeminfo.getPropertyValue('VIDEOSOURCE')`, not a copy.
Also: a console that is switched off counts as **disconnected**, so list disconnected HDMI ports too.
**What TizenZen does:** shows the input full screen *inside* its own window (`tvwindow.show`), so
watching a PS5 never looks like "TizenZen was covered". Back returns to TizenZen.

### 8. The background video never restarts after another app
**Symptom:** after Netflix/YouTube, the background stays empty; no error event, no `playing` event.
**Cause:** the `<video>` element stays stuck after another app used the TV's video decoder.
`play()` hangs or rejects silently.
**What TizenZen does:** when hidden it unloads the clip and replaces the element with a fresh one;
a watchdog retries if nothing plays 30 s after a start; failures are logged as `app: video: ...`.
**Verify:** `selftest.sh` with Netflix, then look at the screen (or camera) for the video.

### 9. Apps cannot be uninstalled over the developer connection
**Symptom:** `sdb shell 0 vd_appuninstall <pkg>` answers `can not uninstall app` (Tizen 5.5 and 6+).
**What works:** the person deletes them on the TV: Home > Apps > gear (top right) > app > Delete.
System packages (`org.tizen.*`, `com.samsung.*`, `adplatform.*`) must not be touched at all.

### 10. The remote-control pairing popup never appears
**Symptom:** `tvkey.py --pair` connects (HTTP 101) but the TV never answers and shows no popup.
**Cause:** Device Connection Manager settings, or the popup being suppressed. Seen on our TV even
with TizenZen hidden.
**Fixes:** Settings > General > External Device Manager > Device Connection Manager:
Access Notification = First Time Only, and check the Device List. If Home Assistant already has the
TV paired, its token works **only from the Home Assistant machine** (`TV_CLIENT_NAME=HomeAssistant`);
from any other machine the TV just waits silently. Ask the person before using that token.

### 11. Developer Mode quirks
- `developerIP` must be the address of the interface that talks to the TV. Wi-Fi and Ethernet differ;
  if the person switches, `sdb connect` fails silently.
- The setting only applies after unplugging the TV (not remote power-off).
- `sdb shell 0 debug <app>` (remote inspector) hung on our TV. Use `status.sh` and the `app: ...` log lines instead.

### 12. If install fails on a newer TV
Tizen 6+ (2021 on) may refuse the default distributor certificate or the service privileges.
AeroTizen signs with a **Samsung developer certificate** bound to the TV's DUID (needs the person's
Samsung account, in their browser). See its `src/aerotizen/certs.py` and Tizen Studio's Certificate Manager.

### 13. Things that look useful but are not
- Wake-on-LAN only wakes the TV's network ("standby"), not the screen. The remote's Power key over the
  network from standby turned it fully off on our TV.
- Hidden service / hotel menus: not needed, risky. Do not suggest them.
- The `samsung.remote.control` websocket on port 8001 (no TLS) never answered on 2020 firmware; use 8002.
- Holding Power over the network (`tvkey.py HOLD:KEY_POWER:4000`) does not restart the TV. It turned
  ours fully off, and the person had to press Power on the remote.
- Reading `/proc/net/tcp` from the service to spot AirPlay connections found nothing. Use the app
  contexts instead (#14).

### 14. AirPlay / screen mirroring gets kicked after a minute
**Symptom:** you mirror a Mac or iPhone to the TV. It works, then TizenZen jumps back over it after
somewhere between a few seconds and a minute. `status.sh` shows `reopened: covered without an app` again and again.
**Cause:** AirPlay is a Samsung system screen, not an app TizenZen opened. The local API is no help:
`curl :8001/api/v2/applications/NRi6kdBYJ0.AirPlayWebApp` says `"running":false` even while the
mirrored picture is on screen. So the watcher saw "nothing on screen" and took it back.
**What TizenZen does:** while TizenZen is covered, the service also reads
`tizen.application.getAppsContext()`. During a cast it lists `com.samsung.tv.airplay-app` and
`NRi6kdBYJ0.AirPlayWebApp`; while either is there, the watcher stands aside (`stand aside: AirPlay`).
One of the two can drop out for a moment mid-cast, so the cast only counts as ended after 5 s
without both (`CAST_END_MS`). Both stay listed for about 60 s after the cast stops, so TizenZen
comes back about a minute after mirroring ends (`reopened: AirPlay ended`). Press Home to skip the wait.
**If mirroring stays black after being kicked:** the Mac can say "Connected" while the TV's AirPlay
receiver is stuck. Disconnect on the Mac, power the TV off and on with the remote, connect again.
**Verify:** mirror for two minutes, then stop. `status.sh` shows `stand aside: AirPlay` and, about a
minute after stopping, `reopened: AirPlay ended`. `curl http://<tv>:47791/` has a `contexts` list with
every app context the service saw last; check the AirPlay names there if your firmware differs.
On a Mac, mirroring can be started without hands with AppleScript: Control Centre >
checkbox `controlcenter-screen-mirroring` (click) > checkbox `screen-mirroring-device-AirPlay:<tv mac>` (AXPress).
