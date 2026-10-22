#!/bin/sh
# Show what the on-TV watcher service decided recently (its log), plus which watched apps are on screen.
: "${TV_IP:?set TV_IP}"
curl -s -m 4 "http://$TV_IP:47791/" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print('Home on screen:', d.get('selfVisible'), '| watching:', d.get('watched'))
for line in d.get('log', [])[-15:]: print('  ', line)" || echo "service not answering (not installed, or TV off)"
