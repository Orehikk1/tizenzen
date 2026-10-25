# Changelog

## 2026-10-25: videos shared from a phone no longer get kicked

**Problem.** On the phone you tap cast or share-to-TV on a video. The video starts on the TV, then
TizenZen jumps over it after 1 to 6 seconds and the video pauses.

**Cause.** The TV plays a shared video in Samsung's own player, `org.tizen.video-player-tv`. The
TV's local API (port 8001) cannot see that player. Two things went wrong:

1. The watcher did not know this player, so it thought nothing was on screen and took the screen back.
2. If YouTube (or another app TizenZen opened) was on screen before the cast, the watcher read
   "YouTube is gone" as "the person left YouTube" and reopened TizenZen after 0.8 s. It never checked
   for a cast on that path.

**Fix** (`app/service/index.js`).

- `org.tizen.video-player-tv` is now in `CAST_APPS`, next to the two AirPlay apps.
- Before reopening TizenZen for a "left" app, the watcher checks the TV's app contexts. If a cast is
  running, it stands aside. The log says `stand aside: cast over <app>`.
- When an app comes back on screen after a cast, the cast state is cleared, so later decisions use
  the normal 6 s grace.
- New debug page `http://<tv>:47791/ctx` lists the TV's running app contexts live.

**New tool.** `tools/cast-test.sh` sends a video to the TV over DLNA, the same way a phone does. No
pairing is needed. It shares only the chosen file, and only while it runs.

```sh
TV_IP=<tv-ip> tools/cast-test.sh play video.mp4   # H.264 .mp4; Ctrl+C when done
TV_IP=<tv-ip> tools/cast-test.sh state            # PLAYING / PAUSED_PLAYBACK / STOPPED
TV_IP=<tv-ip> tools/cast-test.sh stop
```

A video joined with `ffmpeg -stream_loop ... -c copy` stops on the TV after about 10 s. Re-encode
it for long tests.

**Tests on a real TV** (Samsung UE65TU7022, Tizen 5.5).

| Test | Before | After |
|---|---|---|
| Cast a video while TizenZen is on screen | kicked | 26 s video plays to the end, TizenZen comes back |
| Cast a video while YouTube is open | kicked after 4 s, video paused | 104 s video plays to the end, YouTube comes back |
| Close YouTube after a cast | | TizenZen back within 5 s |
| `tools/selftest.sh` (YouTube, Jellyfin, Netflix) | PASS | PASS |

Still to confirm: a cast from a real iPhone.

**Audit.** Before pushing, the change was reviewed:

- Fixed: a leftover cast timer could make TizenZen return at once instead of after the 6 s grace.
- Fixed: the first version of the test tool shared the whole folder of the video on the network.
- Checked: `/ctx` shows only app ids, on the local network, the same list `/status` already shows.
- Checked: no personal data in the repo; the only IP addresses are examples.

**Docs.** `docs/PITFALLS.md` #15 (full write-up), README (casting feature, tool table, how it
works), AGENTS.md (cast test in the test commands).

## 2026-10-24: AirPlay screen mirroring no longer gets kicked

The watcher reads `tizen.application.getAppsContext()` and stands aside while
`com.samsung.tv.airplay-app` or `NRi6kdBYJ0.AirPlayWebApp` is running. See `docs/PITFALLS.md` #14.

## 2026-10-22: first public release
