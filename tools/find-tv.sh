#!/bin/sh
# Find Samsung TVs on the local network and show what matters for installing TizenZen.
# Usage: tools/find-tv.sh [subnet-prefix]      e.g. tools/find-tv.sh 192.168.1
PREFIX=${1:-$(ipconfig getifaddr en0 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}')}
PREFIX=$(echo "$PREFIX" | cut -d. -f1-3)
echo "Scanning $PREFIX.1-254 for Samsung TVs (port 8001)..."
for i in $(seq 1 254); do
  ( r=$(curl -s -m 1 "http://$PREFIX.$i:8001/api/v2/" 2>/dev/null)
    case "$r" in *Samsung*)
      echo "$r" | python3 -c "
import json,sys; d=json.load(sys.stdin)['device']
print('TV  %s  %s  OS=%s  power=%s  developerMode=%s  developerIP=%s' % (
  d.get('ip'), d.get('modelName'), d.get('OS'), d.get('PowerState'), d.get('developerMode'), d.get('developerIP')))";;
    esac ) &
done
wait
echo "developerMode must be 1 and developerIP must be THIS computer's address (see AGENTS.md step 2)."
