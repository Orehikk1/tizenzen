#!/bin/sh
# Self-test without touching the remote: open/close apps through the TV's local API and check
# that Home comes back. Usage: TV_IP=... tools/selftest.sh [statusId ...]   (default: YouTube)
: "${TV_IP:?set TV_IP}"
API="http://$TV_IP:8001/api/v2/applications"
APPS=${*:-111299001912}
vis() { curl -s -m 3 "$API/$1" | python3 -c "import json,sys; print(json.load(sys.stdin).get('visible'))" 2>/dev/null; }
fail=0
for a in $APPS; do
  curl -s -m 5 -X POST "$API/$a" >/dev/null; sleep 12
  open=$(vis "$a"); home=$(vis TizenZen01.Home)
  echo "opened $a: app on screen=$open, Home on screen=$home (want True/False)"
  [ "$open" = "True" ] && [ "$home" = "False" ] || fail=1
  curl -s -m 5 -X DELETE "$API/$a" >/dev/null; sleep 6
  home=$(vis TizenZen01.Home)
  echo "closed $a: Home on screen=$home (want True)"
  [ "$home" = "True" ] || fail=1
done
TV_IP=$TV_IP "$(dirname "$0")/status.sh"
[ $fail = 0 ] && echo "PASS" || { echo "FAIL (see docs/PITFALLS.md)"; exit 1; }
