#!/bin/sh
# Photo of the TV through an iPhone used as a Mac webcam (Continuity Camera). See docs/CAMERA.md.
# Usage: tools/camera-snap.sh out.jpg ["iPhone Camera"]
OUT=${1:-tv.jpg}
DEV=${2:-$(ffmpeg -hide_banner -f avfoundation -list_devices true -i "" 2>&1 | grep -o "\] \[[0-9]*\] iPhone[^D]*Camera" | head -1 | sed 's/.*\] //')}
[ -z "$DEV" ] && { echo "No iPhone camera found. Lock the iPhone near the Mac, same Apple ID, Wi-Fi + Bluetooth on."; exit 1; }
ffmpeg -hide_banner -loglevel error -f avfoundation -framerate 30 -pixel_format nv12 -i "$DEV" \
  -vf "select=gte(n\,20),scale=1280:-1" -frames:v 1 -update 1 -y "$OUT" && echo "$OUT"
