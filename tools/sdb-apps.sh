#!/bin/sh
# List installed apps with their Tizen ids (for config.js "id"). Needs developer mode + sdb.
: "${TV_IP:?set TV_IP}"
SDB=${SDB:-$HOME/tizen-studio/tools/sdb}
"$SDB" connect "$TV_IP" >/dev/null 2>&1
# applist never exits on some firmware, so stop it after 15 s
( "$SDB" -s "$TV_IP:26101" shell 0 applist & sleep 15; kill $! 2>/dev/null ) 2>/dev/null | grep "'" | grep -v -iE "service|daemon|engine|agent|ui-application|test"
