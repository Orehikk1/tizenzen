# Camera: let the assistant see the TV

When a problem can only be seen on screen (a popup that does not appear, a black picture, which tile
is focused), a phone camera pointed at the TV saves a lot of back and forth.

**Mac + iPhone (Continuity Camera):** place the iPhone so the whole TV screen is in view, landscape,
1.5 to 2 m away, locked, same Apple ID as the Mac, Wi-Fi and Bluetooth on. The Mac then lists it as a
camera. The first time, macOS asks to allow camera access for the terminal app.

```sh
ffmpeg -f avfoundation -list_devices true -i ""     # find "iPhone ... Camera"
tools/camera-snap.sh tv.jpg                         # one still photo of the TV
```

The assistant sees still photos, not live video; it takes one whenever it needs to (about a second).
Nothing is recorded beyond the files it writes. For timing (how long until the home screen appears
after Power), take a photo every 2 s for a minute:

```sh
ffmpeg -f avfoundation -framerate 30 -pixel_format nv12 -i "iPhone Camera" -t 60 \
  -vf "fps=1/2,scale=480:-1,drawtext=text='%{localtime\:%T}':x=10:y=10:fontsize=28:fontcolor=yellow" f%03d.jpg
```

**Other setups:** any webcam or a USB camera works the same way (`ffmpeg -f v4l2` on Linux,
`-f dshow` on Windows). Without a camera, ask the person for a phone photo of the screen.

Tips from real use: the photo is useless if the phone slips or something stands in front of it;
check the first photo shows the whole screen. Crop to the TV before reading small text.
