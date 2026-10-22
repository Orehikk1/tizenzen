#!/bin/sh
# Package app/ (+ app/config.local.js if present), install it on the TV and start it.
# Usage: TV_IP=192.168.1.50 tools/deploy.sh
# Needs the Tizen CLI and a signing profile (AGENTS.md step 3). Override with TIZEN=..., PROFILE=...
set -e
: "${TV_IP:?set TV_IP to the TV address (tools/find-tv.sh)}"
TIZEN=${TIZEN:-$HOME/tizen-studio/tools/ide/bin/tizen}
SDB=${SDB:-$HOME/tizen-studio/tools/sdb}
PROFILE=${PROFILE:-TizenZen}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
BUILD=$(mktemp -d)
mkdir -p "$BUILD/src/service" "$BUILD/out"
cd "$ROOT/app"
cp config.xml index.html style.css app.js config.js icon.png "$BUILD/src/"
cp service/index.js "$BUILD/src/service/"
[ -f config.local.js ] && cp config.local.js "$BUILD/src/" || echo "// no local settings" > "$BUILD/src/config.local.js"
"$SDB" connect "$TV_IP" >/dev/null 2>&1 || true
"$TIZEN" package -t wgt -s "$PROFILE" -o "$BUILD/out" -- "$BUILD/src" >/dev/null
"$TIZEN" install -n TizenZen.wgt -s "$TV_IP:26101" -- "$BUILD/out" | grep -iE "successfully installed|fail|error"
"$TIZEN" run -p TizenZen01.Home -s "$TV_IP:26101" | tail -1
rm -rf "$BUILD"
