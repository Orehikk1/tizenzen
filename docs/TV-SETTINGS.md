# Faster and quieter TV: settings, apps, ad blocking

## Free speed-ups
1. **Real restart:** hold the remote's Power until the Samsung logo shows. A short press is only standby.
2. Settings > Support > **Device Care** > Start Device Care (frees memory).
3. Settings > Support > Terms & Privacy (newer: General & Privacy > Privacy Choices): turn off
   **Viewing Information Services** (screen-content tracking), **Interest-Based Advertisements**,
   **Voice Recognition** if unused. Less runs in the background.
4. Software update.
5. Short on speed anyway: the **yellow** remote button turns TizenZen's video background off.

## Delete apps you do not use
On the TV: Home > Apps > gear (top right) > select app > **Delete**. (Not possible over the developer
connection, PITFALLS #9.) Typical candidates: e-Manual, Spotify if unused (it also runs a background
"recommendations" service), demo and shopping apps. Never system parts.

## Block Samsung ads and tracking with DNS
`dns/samsung-ads.txt` (from AeroTizen, trimmed so the app store, logins, updates and casting keep
working). Add it to Pi-hole, AdGuard Home or NextDNS. Most general blocklists (OISD, Hagezi) already
cover most of it; on one TV only `gpm.samsungqbe.com` (telemetry) and `samsungrm.net` were missing.

Check a domain: `dig +short @<dns-server> samsungacr.com` → `0.0.0.0` or empty means blocked.
No home DNS server? Set the TV's DNS to AdGuard DNS `94.140.14.14`
(Settings > Connection > Network > Network Status > IP Settings).
