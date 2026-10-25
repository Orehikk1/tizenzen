# AGENTS.md: installing TizenZen with an AI assistant

You are helping someone replace the ad-filled home screen of a **Samsung Tizen TV** with TizenZen.
This file is the whole playbook. It was written by Claude after doing this the long way on a real TV,
so the steps below skip the dead ends. Read [docs/PITFALLS.md](docs/PITFALLS.md) before you improvise:
almost every "obvious" idea on Tizen was tried and does not work.

**Expected time:** 10 to 20 minutes, most of it the Tizen CLI download.
**What the person must do with their hands:** turn on Developer Mode (step 2), sometimes press
Power on the remote, and answer one or two yes/no questions. Everything else you can do yourself.

## 0. Ground rules

- Work from a computer on the **same network** as the TV, connected the same way each time
  (Wi-Fi and Ethernet give different addresses, and the TV only accepts one; see step 2).
- Never remove system packages (`org.tizen.*`, `com.samsung.*`). It can break the TV's home until a
  factory reset. Only the person deletes apps, on the TV (docs/TV-SETTINGS.md).
- Test with `tools/selftest.sh` and `tools/status.sh`, not by asking the person "does it work?".
  If you are stuck on something only a screen can show, offer the camera option (docs/CAMERA.md).
- Keep the person's details (IP addresses, city, tokens) in `app/config.local.js` and
  `tools/tv-remote-token`. Both are git-ignored. Never commit them.

## 1. Find the TV

```sh
tools/find-tv.sh            # scans the local /24 for Samsung TVs on port 8001
```

You get the IP, model, `OS=Tizen`, `developerMode` and `developerIP`. If nothing is found: the TV is
off, on another subnet, or not Samsung/Tizen (LG webOS, Android TV and Roku are different systems;
for Android/Google TV use CleanYourTV instead).

Check the model year: the letter right after the screen size is the year
(`UE65`**`T`**`U7022`: T = 2020, A = 2021, B = 2022, C = 2023, D = 2024, F = 2025).
Tested models are in [docs/MODELS.md](docs/MODELS.md). Newer years should work but are less tested;
add a row when you are done.

## 2. Developer Mode (the person does this)

Ask the person to:
1. Open **Apps** on the TV and type `1 2 3 4 5` on the remote (number keys, or the on-screen pad).
2. Switch **Developer mode** On and enter **this computer's IP** as Host PC IP.
3. Unplug the TV for 30 seconds (a remote power-off is not enough for this setting).

Verify yourself with `tools/find-tv.sh`: `developerMode=1` and `developerIP` = your address
(`route -n get <tv-ip>` shows which of your interfaces talks to the TV; that one's IP must match).

## 3. Tizen CLI and a signing profile

Download the **web CLI** installer (not the full IDE) from
`https://download.tizen.org/sdk/Installer/tizen-studio_6.1/` (`web-cli_Tizen_Studio_6.1_<os>.bin`),
run it with `--accept-license ~/tizen-studio` (ask the person before accepting the license).
The server is often slow (100 KB/s seen); if so, download on another machine on the network and copy it.

```sh
T=~/tizen-studio/tools/ide/bin/tizen
$T certificate -a TizenZen -p '<random password>' -f tizenzen -c XX -n '<name>'
$T security-profiles add -n TizenZen -a ~/tizen-studio-data/keystore/author/tizenzen.p12 -p '<same password>'
$T cli-config "profiles.path=$HOME/tizen-studio-data/profile/profiles.xml"
```

A self-signed author certificate plus the default Tizen distributor certificate is enough for a
developer-mode install, including the background service. No Samsung account was needed on a 2020
Tizen 5.5 TV. If install fails with a certificate or privilege error on a newer TV, see PITFALLS #12.

## 4. Configure and install

```sh
cp app/config.js app/config.local.js     # then edit: city, lat/lon, tiles, moreApps
TV_IP=<tv-ip> tools/sdb-apps.sh          # lists installed apps and their Tizen ids
TV_IP=<tv-ip> tools/deploy.sh            # package, install, start
```

In `config.local.js`, keep only the fields you change (see the file header). For each tile you need
two ids: `id` (Tizen app id, to open it) and `status` (what the TV's local API calls it, to notice
when the person leaves it). For apps Samsung preinstalls these differ; known pairs are in
docs/PITFALLS.md #3. Check a status id with `curl http://<tv-ip>:8001/api/v2/applications/<status>`
while the app is open: it must answer `"visible":true`.

## 5. Test it yourself

```sh
TV_IP=<tv-ip> tools/selftest.sh 111299001912 <other status ids>   # must print PASS
TV_IP=<tv-ip> tools/status.sh                                     # the watcher's own log
TV_IP=<tv-ip> tools/cast-test.sh play video.mp4                    # phone-style cast; must play to the end (PITFALLS 15)
```

`selftest.sh` opens each app through the TV's API, checks it stays on screen, closes it, and checks
TizenZen comes back. The status log shows every decision the watcher made ("stand aside", "left",
"covered without an app", "TV woke up") and app errors as `app: ...`.

For keys (Home, Back, long-press Back, Power), pair once and use `tools/tvkey.py`:

```sh
TV_IP=<tv-ip> python3 tools/tvkey.py --pair          # person accepts the popup on the TV
TV_IP=<tv-ip> python3 tools/tvkey.py KEY_HOME
TV_IP=<tv-ip> python3 tools/tvkey.py HOLD:KEY_RETURN:2000
```

Ask the person to press **Power** once on the real remote to test wake-up; the network cannot turn
the screen on from deep standby. `status.sh` should then show `TV woke up` and `reopened: wake`.

## 6. Optional extras

- **Settings tile** that really opens Samsung's settings: needs `tools/keyhelper.py` on an
  always-on machine. [docs/SETTINGS-HELPER.md](docs/SETTINGS-HELPER.md)
- **Ad and tracking blocking** with Pi-hole / AdGuard: `dns/samsung-ads.txt`. [docs/TV-SETTINGS.md](docs/TV-SETTINGS.md)
- **TV settings** that make it faster and quieter, and which apps to delete. Same file.

## 7. Finish

- Tell the person, plainly, what works and the known limits (README "Limits").
- Ask if they want the Tizen CLI removed (~600 MB): `rm -rf ~/tizen-studio ~/tizen-studio-data ~/.package-manager`.
  They need it again only to update TizenZen.
- If their TV model is not in docs/MODELS.md, offer to add a row (and to open a pull request).
