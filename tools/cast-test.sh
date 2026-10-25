#!/bin/sh
# Send a video to the TV over DLNA, the way a phone's "cast / share to TV" does. No pairing needed.
# Usage: TV_IP=<tv> tools/cast-test.sh play [video.mp4] | stop | state
# play serves the file from this computer on port 8765 until stopped with Ctrl+C.
: "${TV_IP:?set TV_IP}"
CTL=http://$TV_IP:9197/upnp/control/AVTransport1
FILE=${2:-}
MY_IP=$(route -n get "$TV_IP" 2>/dev/null | awk '/interface:/{print $2}' | xargs ipconfig getifaddr 2>/dev/null || hostname -I | awk '{print $1}')
soap() {
  curl -s -m 10 -H 'Content-Type: text/xml; charset="utf-8"' \
    -H "SOAPACTION: \"urn:schemas-upnp-org:service:AVTransport:1#$1\"" \
    -d "<?xml version=\"1.0\"?><s:Envelope xmlns:s=\"http://schemas.xmlsoap.org/soap/envelope/\" s:encodingStyle=\"http://schemas.xmlsoap.org/soap/encoding/\"><s:Body><u:$1 xmlns:u=\"urn:schemas-upnp-org:service:AVTransport:1\"><InstanceID>0</InstanceID>$2</u:$1></s:Body></s:Envelope>" \
    "$CTL" | grep -o "<CurrentTransportState>[A-Z_]*\|<faultstring>[^<]*" | head -1 | sed 's/<[a-zA-Z]*>//' | grep . || echo "$1 ok"
}
case $1 in
play)
  [ -f "$FILE" ] || { echo "give an .mp4 (H.264) file"; exit 1; }
  DIR=$(cd "$(dirname "$FILE")" && pwd); NAME=$(basename "$FILE")
  python3 -m http.server 8765 --directory "$DIR" --bind 0.0.0.0 >/dev/null 2>&1 & SRV=$!
  trap 'kill $SRV 2>/dev/null' EXIT INT TERM; sleep 1
  URL=http://$MY_IP:8765/$NAME
  META='&lt;DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" xmlns:dc="http://purl.org/dc/elements/1.1/"&gt;&lt;item id="1" parentID="0" restricted="1"&gt;&lt;dc:title&gt;test&lt;/dc:title&gt;&lt;upnp:class&gt;object.item.videoItem&lt;/upnp:class&gt;&lt;res protocolInfo="http-get:*:video/mp4:*"&gt;'$URL'&lt;/res&gt;&lt;/item&gt;&lt;/DIDL-Lite&gt;'
  soap SetAVTransportURI "<CurrentURI>$URL</CurrentURI><CurrentURIMetaData>$META</CurrentURIMetaData>"
  sleep 1; soap Play "<Speed>1</Speed>"
  echo "playing $URL - Ctrl+C to stop serving"; wait $SRV;;
stop) soap Stop "";;
state) soap GetTransportInfo "";;
*) echo "usage: TV_IP=<tv> $0 play video.mp4 | stop | state";;
esac
