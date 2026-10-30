# Changelog

## 1.2.0 (2026-10-30): brighter at night, HBO Max tile, fewer false casts

**Brighter.** The sunset dim used to lay a black layer over the whole screen, clock and tiles
included, on top of dark-glass tiles. Now it darkens only the video behind (`#dim` sits under the
text), tiles are a more solid dark glass with a thin light edge and a shadow, icons and labels are
bigger and bolder, and grey text is brighter (`.muted` 0.55 to 0.75).

**HBO Max.** New tile icon `hbo` (the letters H B O in the same line style). Its ids on a 2020 TV:
open with `5b8c3eb16b.BeamCTVDev`, status `3202301029760` (the local API does not know it by its Tizen
id, so with the Tizen id as status the watcher would have called it "never showed up" after 20 s).

**Fewer false casts.** The two AirPlay apps also show up with no cast at all (after boot, after a
Mac or iPhone talked to the TV). A cast now starts only when both are there (or Samsung's video
player is), and one is enough to keep a running cast going. Real Mac mirroring tested: TizenZen stood
aside and came back 64 s after it stopped. Limit: sometimes both show up with no cast, and then
TizenZen comes back about a minute late after leaving an app. The TV gives no better signal: the app
contexts, the local API and the AirPlay `/info` and `flags` were the same with and without a cast.

**DNS list.** `gpm.samsungqbe.com` is commented out in `dns/samsung-ads.txt`: blocking it breaks the
App Store (docs/TV-SETTINGS.md has the install steps when you keep it blocked).

**Tested.** `node tools/wake-sim.js` PASS; `tools/selftest.sh` with YouTube, Jellyfin and HBO Max opens
each app and closes it: PASS, with a lone leftover `NRi6kdBYJ0.AirPlayWebApp` listed the whole time (1.1.1
would have stood aside for it); the new look and the HBO tile checked on camera.

## 1.1.1 (2026-10-30): the same kick after a light standby

**Problem.** Still kicked out of YouTube after turning the TV on, the same day 1.1.0 went out.

**Cause.** This TV has two kinds of standby. In deep standby the watcher's timers stop, so the
wake shows up as a timer gap and 1.1.0 handled it. In light standby (the first seconds to an hour
after Power off) the watcher keeps running, so there is no gap and the 1.1.0 protection never
switched on. Worse, in light standby the local API still says the last app (YouTube) is on screen; at
power-on it suddenly says it is gone, and the watcher read that as "the person left YouTube".

**Fix** (`app/service/index.js`). The watcher reads `PowerState` from `http://127.0.0.1:8001/api/v2/`
about once a second. While it says `standby` the watcher does nothing (`TV in standby`). `standby` to
`on` counts as a wake (`TV turned on`), with the same protection as 1.1.0. Repeated
`stand aside: ... is on screen` lines are logged once, so the 40-line log keeps the useful lines.

**Tested.** `node tools/wake-sim.js` has two new cases (light standby + YouTube tile, light standby +
YouTube restored by the TV); 1.1.0 fails both (17 and 20 reopens), 1.1.1 passes all 7.
`tools/selftest.sh` PASS. On the real TV, watched through a camera: Power off, Wake-on-LAN on,
YouTube opened 6 s later: the log shows `TV in standby`, `TV turned on`, `reopened: wake`, then
`stand aside: 111299001912 is on screen`, and YouTube stayed on screen for the whole 90 s check.

## 1.1.0 (2026-10-30): YouTube no longer gets kicked right after the TV is turned on

**Problem.** In the morning you turn the TV on and open YouTube. A few seconds later TizenZen
jumps back over it. Some evenings it kept doing that every 6 s for two minutes.

**Cause.** After a wake the watcher reopened TizenZen at +4 s and +10 s no matter what, so a
quick YouTube tap was undone. And for one to two minutes after a wake the TV's local API says every
app is "not visible", so the watcher thought nothing was on screen and kept taking it back.

**Fix** (`app/service/index.js`, `app/app.js`).

- The Home app pings the watcher every second while it is on screen (`/alive`), says when it
  leaves (`/hidden`) and resends `/watch` if the first try is lost.
- Wake retries are skipped once TizenZen has been on screen or an app was opened (`skip wake +10s: app opened`).
- Until the local API shows something appearing on screen again (at most 3 minutes), the watcher takes
  the screen back at most once and never after TizenZen was on screen (`hold: ...`).
- Right after a wake, an app opened from TizenZen whose process is running is not called "never
  showed up" just because the local API is slow.

**New test.** `node tools/wake-sim.js` runs the watcher on the computer with a fake clock and fake TV
API through five cases (wake + YouTube, wake + app opened elsewhere, wake with TizenZen hidden,
Samsung bar, leaving YouTube). The old watcher fails three of them (21 reopens in the first).

**Tested.** `tools/selftest.sh` PASS on a 2020 UE65TU7022 (YouTube, Jellyfin, Netflix) and
`tools/wake-sim.js` PASS. A real power-on can't be done over the network (the screen needs the
Power button), so the first real check is the next morning: `tools/status.sh` must show
`watching ...` and no `reopened` until the person leaves YouTube.

**Still open.**

- The TV sometimes starts `com.samsung.tv.airplay-app` or `NRi6kdBYJ0.AirPlayWebApp` with no cast at
  all (at wake, or when an iPhone nearby looks for AirPlay screens). The watcher takes that as a cast
  and stands aside, so after leaving an app TizenZen can come back about a minute late
  (`stand aside: cast over ...`, then `reopened: cast ended`). Nobody gets kicked; it is only a delay.
  Left as is so the AirPlay fix (PITFALLS 14) stays safe.
- Samsung's home bar opened with the remote's Home key on top of TizenZen does not hide the page,
  so neither the local API nor the heartbeat can see it (same cause as PITFALLS 2). Press Back.

## 1.0.2 (2026-10-25): videos shared from a phone no longer get kicked

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

## 1.0.1 (2026-10-24): AirPlay screen mirroring no longer gets kicked

The watcher reads `tizen.application.getAppsContext()` and stands aside while
`com.samsung.tv.airplay-app` or `NRi6kdBYJ0.AirPlayWebApp` is running. See `docs/PITFALLS.md` #14.

## 1.0.0 (2026-10-22): first public release
