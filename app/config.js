// TizenZen settings. Change these, or better: copy this file to config.local.js and change that
// one (it is loaded after this file, is ignored by git, and is packaged by tools/deploy.sh).
window.TIZENZEN = {
  // Weather location (Open-Meteo, free, no key). Find coordinates on any map.
  city: 'Amsterdam',
  lat: 52.3676,
  lon: 4.9041,

  // Big tiles on the home screen.
  //   id:     Tizen app id, used to open the app. List them with: tools/sdb-apps.sh
  //   status: id the TV's local API knows the app by, used to notice when you leave it.
  //           For Samsung's preinstalled apps this is the Smart Hub number, not the Tizen id.
  //   icon:   youtube | jellyfin | netflix | hbo | play | music | globe
  tiles: [
    { label: 'YouTube', icon: 'youtube', id: '9Ur5IzDKqV.TizenYouTube', status: '111299001912' },
    { label: 'Netflix', icon: 'netflix', id: 'org.tizen.netflix-app', status: '3201907018807' }
  ],

  // The "Apps" tile opens this short list (Samsung blocks apps from opening its own Apps screen).
  // untracked: true for apps the TV can't report (the App Store); Home then steps aside for 10 min.
  moreApps: [
    { label: 'Internet', id: 'com.samsung.tv.knox-browser', status: '3201907018784' },
    { label: 'App Store', id: 'com.samsung.tv.store', untracked: true }
  ],

  // Optional helper on a home server that presses the remote's Settings key (see docs/SETTINGS-HELPER.md).
  // Without it the Settings tile explains how to reach Samsung's settings.
  keyHelper: null,          // e.g. 'http://192.168.1.10:8787'

  // Apple TV aerial videos as background (streamed, ~300 MB per clip). Yellow button toggles on the TV.
  video: true,
  videoIdleStopMin: 60      // stop streaming after this many minutes without a remote press
};
