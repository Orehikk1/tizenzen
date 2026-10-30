// TizenZen: a calm home screen for Samsung Tizen TVs. Clock, local weather (Open-Meteo, no key),
// app tiles, Apple aerial video background, sunset dim. Settings live in config.js / config.local.js.
// Written for Tizen 5.5 (Chromium ~69): no optional chaining, no `??`, no flex `gap`.
(function () {
  'use strict';

  var CFG = window.TIZENZEN;
  var WEATHER_URL = 'https://api.open-meteo.com/v1/forecast?latitude=' + CFG.lat + '&longitude=' + CFG.lon +
    '&current=temperature_2m,weather_code,is_day' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset' +
    '&timezone=auto&forecast_days=8';
  var WEATHER_EVERY_MS = 30 * 60 * 1000;
  var DIM_MAX = 0.35;          // how dark the video gets at night (text and tiles are not dimmed)
  var DIM_RAMP_MIN = 45;       // minutes to fade in/out around sunset/sunrise

  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'];

  var isTizen = typeof window.tizen !== 'undefined';
  var weather = null;

  function $(id) { return document.getElementById(id); }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function hhmm(d) { return pad(d.getHours()) + ':' + pad(d.getMinutes()); }

  // ---- fit 1920x1080 stage into a desktop window (TV is already 1920x1080) ----
  function fit() {
    var s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    var x = (window.innerWidth - 1920 * s) / 2, y = (window.innerHeight - 1080 * s) / 2;
    $('stage').style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + s + ')';
  }

  // ---- clock ----
  function tickClock() {
    var d = new Date();
    $('time').textContent = hhmm(d);
    $('date').textContent = DAYS[d.getDay()] + ', ' + d.getDate() + ' ' + MONTHS[d.getMonth()];
    applyDim(d);
  }

  // ---- weather icons (WMO codes) ----
  var CLOUD = '<path d="M7 18.5h10.5a4 4 0 0 0 .4-7.98A6 6 0 0 0 6.3 11.2 3.7 3.7 0 0 0 7 18.5z"/>';
  var ICONS = {
    sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/>',
    moon: '<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z"/>',
    partly: '<circle cx="8.5" cy="8.5" r="3.2"/><path d="M8.5 2.5v1.4M2.5 8.5h1.4M4.3 4.3l1 1M12.7 4.3l-1 1"/>' +
      '<path d="M9 20h9a3.5 3.5 0 0 0 .3-6.98A5 5 0 0 0 8.7 13.6 3.2 3.2 0 0 0 9 20z"/>',
    cloud: CLOUD,
    fog: '<path d="M4 9h16M3 13h18M5 17h14"/>',
    drizzle: '<path d="M7 15h10.5a4 4 0 0 0 .4-7.98A6 6 0 0 0 6.3 7.7 3.7 3.7 0 0 0 7 15z"/><path d="M9 18.5v1M13 18.5v1M17 18.5v1"/>',
    rain: '<path d="M7 15h10.5a4 4 0 0 0 .4-7.98A6 6 0 0 0 6.3 7.7 3.7 3.7 0 0 0 7 15z"/><path d="M8.5 17.5l-1 3M12.5 17.5l-1 3M16.5 17.5l-1 3"/>',
    snow: '<path d="M7 15h10.5a4 4 0 0 0 .4-7.98A6 6 0 0 0 6.3 7.7 3.7 3.7 0 0 0 7 15z"/><path d="M8.5 18.5h.01M12.5 20h.01M16.5 18.5h.01"/>',
    storm: '<path d="M7 15h10.5a4 4 0 0 0 .4-7.98A6 6 0 0 0 6.3 7.7 3.7 3.7 0 0 0 7 15z"/><path d="M12.5 15.5l-2 3.5h3l-2 3.5"/>'
  };

  function describe(code, isDay) {
    if (code === 0) return { icon: isDay ? 'sun' : 'moon', text: 'Clear' };
    if (code === 1) return { icon: isDay ? 'sun' : 'moon', text: 'Mostly clear' };
    if (code === 2) return { icon: 'partly', text: 'Partly cloudy' };
    if (code === 3) return { icon: 'cloud', text: 'Cloudy' };
    if (code === 45 || code === 48) return { icon: 'fog', text: 'Fog' };
    if (code >= 51 && code <= 57) return { icon: 'drizzle', text: 'Drizzle' };
    if (code >= 61 && code <= 67) return { icon: 'rain', text: 'Rain' };
    if (code >= 71 && code <= 77) return { icon: 'snow', text: 'Snow' };
    if (code >= 80 && code <= 82) return { icon: 'rain', text: 'Showers' };
    if (code === 85 || code === 86) return { icon: 'snow', text: 'Snow showers' };
    if (code >= 95) return { icon: 'storm', text: 'Thunderstorm' };
    return { icon: 'cloud', text: '' };
  }

  function svg(name) { return '<svg viewBox="0 0 24 24">' + ICONS[name] + '</svg>'; }
  function deg(v) { return Math.round(v) + '°'; }
  function timeOf(iso) { return iso.slice(11, 16); }   // "2026-10-22T17:45" -> "17:45"
  function parseLocal(iso) {                            // local time string of the city -> Date
    var p = iso.split(/[-T:]/);
    return new Date(+p[0], +p[1] - 1, +p[2], +p[3], +p[4]);
  }

  function renderWeather() {
    $('city').textContent = CFG.city;
    if (!weather) return;
    var c = weather.current, dd = weather.daily;
    var now = describe(c.weather_code, c.is_day === 1);
    $('nowIcon').innerHTML = svg(now.icon);
    $('nowTemp').textContent = deg(c.temperature_2m);
    $('nowText').textContent = now.text;
    $('nowRange').textContent = 'H ' + deg(dd.temperature_2m_max[0]) + '   L ' + deg(dd.temperature_2m_min[0]);
    $('nowSun').textContent = 'Sunrise ' + timeOf(dd.sunrise[0]) + '   ·   Sunset ' + timeOf(dd.sunset[0]);

    var html = '';
    for (var i = 1; i < dd.time.length && i <= 7; i++) {
      var day = parseLocal(dd.time[i] + 'T12:00');
      var w = describe(dd.weather_code[i], true);
      html += '<div class="day"><div class="name">' + DAYS[day.getDay()].slice(0, 3) + '</div>' +
        '<div class="icon">' + svg(w.icon) + '</div>' +
        '<span class="hi">' + deg(dd.temperature_2m_max[i]) + '</span>' +
        '<span class="lo">' + deg(dd.temperature_2m_min[i]) + '</span></div>';
    }
    $('week').innerHTML = html;
    $('updated').textContent = 'Updated ' + hhmm(new Date(weather.fetchedAt));
    applyDim(new Date());
  }

  function loadWeather() {
    fetch(WEATHER_URL).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (data) {
      data.fetchedAt = Date.now();
      weather = data;
      try { localStorage.setItem('weather', JSON.stringify(data)); } catch (e) {}
      renderWeather();
    }).catch(function () {
      // keep showing the cached copy; the "Updated" time tells how old it is
    });
  }

  // ---- sunset dim ----
  // 0 during the day, ramps to 1 over DIM_RAMP_MIN after sunset, back to 0 over the ramp before sunrise.
  function nightLevel(d) {
    if (!weather) return 0;
    var dd = weather.daily, idx = 0;
    var today = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    for (var i = 0; i < dd.time.length; i++) if (dd.time[i] === today) idx = i;
    var rise = parseLocal(dd.sunrise[idx]).getTime();
    var set = parseLocal(dd.sunset[idx]).getTime();
    var ramp = DIM_RAMP_MIN * 60000, t = d.getTime();
    if (t >= set) return Math.min(1, (t - set) / ramp);
    if (t <= rise) return Math.min(1, (rise - t) / ramp);
    return 0;
  }

  function applyDim(d) {
    var n = nightLevel(d);
    $('dim').style.opacity = (n * DIM_MAX).toFixed(3);
    $('glow').className = n > 0.5 ? 'warm' : '';
  }

  // ---- Apple TV aerial background ----
  // Streamed from Apple's screensaver CDN (1080p H.264, ~300 MB per clip). Night set plays after sunset.
  var V = 'https://sylvan.apple.com/Videos/';
  var DAY_CLIPS = [
    ['Grand Canyon', 'G007_C004_UHD_SDR_2K_AVC.mov'],
    ['Grand Canyon', 'G008_C015_UHD_SDR_2K_AVC.mov'],
    ['Patagonia', 'P001_C005_UHD_SDR_2K_AVC.mov'],
    ['Patagonia', 'P005_C002_UHD_SDR_2K_AVC.mov'],
    ['Yosemite', 'Y004_C015_SDR_2K_AVC.mov'],
    ['Yosemite', 'Y005_C003_SDR_2K_AVC.mov'],
    ['Iceland', 'I003_C008_SDR_2K_AVC.mov'],
    ['Iceland', 'I003_C011_SDR_2K_AVC.mov'],
    ['Scotland', 'S003_C020_SDR_2K_AVC.mov'],
    ['Scotland', 'S006_C007_SDR_2K_AVC.mov'],
    ['Greenland', 'comp_GL_G002_C002_PSNK_v03_SDR_PS_20180925_SDR_2K_AVC.mov'],
    ['Greenland', 'comp_GL_G004_C010_PSNK_v04_SDR_PS_FINAL_20180709_SDR_2K_AVC.mov'],
    ['Hawaii', 'comp_H012_C009_PS_v01_SDR_PS_20180925_SDR_2K_AVC.mov'],
    ['Hawaii', 'comp_H004_C009_PS_v01_SDR_PS_20180925_SDR_2K_AVC.mov'],
    ['New Zealand', 'comp_A105_C003_0212CT_FLARE_v10_SDR_PS_FINAL_20180711_SDR_2K_AVC.mov'],
    ['Tahiti Waves', 'g201_TH_803_A001_8_SDR_20191031_SDR_2K_AVC.mov'],
    ['Tahiti Waves', 'g201_TH_804_A001_8_SDR_20191031_SDR_2K_AVC.mov'],
    ['Caribbean', 'comp_GMT308_139K_142NC_CARIBBEAN_DAY_v09_SDR_FINAL_22062018_SDR_2K_AVC.mov']
  ];
  var NIGHT_CLIPS = [
    ['Korea and Japan at night', 'comp_GMT026_363A_103NC_E1027_KOREA_JAPAN_NIGHT_v18_SDR_PS_20180907_SDR_2K_AVC.mov'],
    ['Africa at night', 'comp_GMT312_162NC_139M_1041_AFRICA_NIGHT_v14_SDR_FINAL_20180706_SDR_2K_AVC.mov'],
    ['New York at night', 'comp_GMT307_136NC_134K_8277_NY_NIGHT_01_v25_SDR_PS_20180907_SDR_2K_AVC.mov'],
    ['North America aurora', 'comp_GMT314_139M_170NC_NORTH_AMERICA_AURORA__COMP_v22_SDR_20181206_v12CC_SDR_2K_AVC.mov'],
    ['Antarctica aurora', 'comp_GMT110_112NC_364D_1054_AURORA_ANTARTICA__COMP_FINAL_v34_PS_SDR_20181107_SDR_2K_AVC.mov'],
    ['Alaskan jellies', 'g201_AK_A003_C014_SDR_20191113_SDR_2K_AVC.mov'],
    ['Alaskan jellies', 'AK_A004_C012_SDR_20191217_SDR_2K_AVC.mov'],
    ['Palau jellies', 'PA_A001_C007_SDR_20190717_SDR_2K_AVC.mov'],
    ['Palau jellies', 'PA_A002_C009_SDR_20190730_ALT01_SDR_2K_AVC.mov']
  ];
  var IDLE_STOP_MS = (CFG.videoIdleStopMin || 60) * 60 * 1000;   // stop streaming after this long without a remote press
  var bg = $('bg'), lastClip = '', clipName = '', videoErrors = 0, lastInput = Date.now(), videoStopped = false;

  function nextClip() {
    var list = nightLevel(new Date()) > 0.5 ? NIGHT_CLIPS : DAY_CLIPS, c;
    do { c = list[Math.floor(Math.random() * list.length)]; } while (list.length > 1 && c[1] === lastClip);
    lastClip = c[1];
    return c;
  }

  // Yellow button turns the video background off/on (remembered). Off = plain dark screen, lightest for the TV.
  var videoOn = CFG.video !== false;
  try { if (localStorage.getItem('videoOn')) videoOn = localStorage.getItem('videoOn') === '1'; } catch (e) {}

  // A start can fail quietly (play() rejected, e.g. Netflix still holds the TV's video decoder),
  // so failures retry, and a watchdog retries if nothing is playing 30 s after a start.
  var startWatchdog = null;
  function videoFailed(why) {
    if (videoStopped || !videoOn || document.hidden) return;
    tell('/note?msg=' + encodeURIComponent('video: ' + why));
    // offline (the network is slow to come back after the TV wakes) or clip gone:
    // keep trying for about 3 minutes, then stay on the plain background
    if (++videoErrors < 12) setTimeout(playNext, 15000);
    else stopVideo();
  }

  function playNext() {
    if (document.hidden || !videoOn) return;
    var c = nextClip();
    bg.className = '';                        // fade out, swap source, fade back in on 'playing'
    clearTimeout(startWatchdog);
    setTimeout(function () {
      if (document.hidden) return;
      bg.src = V + c[1];
      clipName = c[0];
      var p = bg.play();
      if (p && p.catch) p.catch(function (e) { videoFailed('play() ' + (e && e.name)); });
      startWatchdog = setTimeout(function () { if (bg.paused) videoFailed('did not start in 30 s'); }, 30000);
    }, 1500);
  }

  // Fully unload the clip: frees the TV's video decoder and memory, not just pauses.
  function releaseVideo() {
    clearTimeout(startWatchdog);
    $('place').textContent = '';
    bg.pause();
    bg.removeAttribute('src');
    bg.load();
    freshVideo();
  }

  function stopVideo() {
    videoStopped = true;
    bg.className = '';
    $('stage').className = '';
    $('place').textContent = '';
    setTimeout(function () { if (videoStopped) releaseVideo(); }, 1600);
  }

  function toggleVideo() {
    videoOn = !videoOn;
    try { localStorage.setItem('videoOn', videoOn ? '1' : '0'); } catch (e) {}
    if (videoOn) { videoStopped = false; videoErrors = 0; playNext(); toast('Video background on'); }
    else { stopVideo(); toast('Video background off'); }
  }

  // After another app used the TV's video decoder, the old <video> element never starts again,
  // so each release swaps in a fresh element.
  function hookVideo(v) {
    v.addEventListener('playing', function () {
      videoErrors = 0;
      clearTimeout(startWatchdog);
      v.className = 'on';
      $('stage').className = 'video';
      $('place').textContent = clipName;
    });
    v.addEventListener('ended', playNext);
    v.addEventListener('error', function () {
      if (v !== bg || !v.getAttribute('src')) return;
      videoFailed('error ' + (v.error && v.error.code));
    });
  }
  function freshVideo() {
    var v = document.createElement('video');
    v.id = 'bg';
    v.muted = true;
    v.setAttribute('muted', '');
    v.setAttribute('playsinline', '');
    v.preload = 'auto';
    hookVideo(v);
    bg.parentNode.replaceChild(v, bg);
    bg = v;
  }
  hookVideo(bg);

  function wakeVideo() {
    lastInput = Date.now();
    if (videoStopped && videoOn) { videoStopped = false; videoErrors = 0; playNext(); }
  }
  setInterval(function () {
    if (!videoStopped && Date.now() - lastInput > IDLE_STOP_MS) stopVideo();
  }, 60000);

  // ---- tiles + remote ----
  var TILE_ICONS = {
    youtube: '<rect x="2.5" y="5.5" width="19" height="13" rx="3.5"/><path d="M10 9.2v5.6l4.8-2.8z" class="fill"/>',
    jellyfin: '<path d="M12 3c-2.4 0-9 12.6-7.8 15S18.6 20.4 19.8 18 14.4 3 12 3zm0 5.2c1.4 0 5.2 7.2 4.4 8.6s-8 1.4-8.8 0S10.6 8.2 12 8.2z" class="fill"/><path d="M12 11.2c-.8 0-2.8 4-2.4 4.8s4.4.8 4.8 0-1.6-4.8-2.4-4.8z" class="fill"/>',
    netflix: '<path d="M8 3.5v17M16 3.5v17M8 3.5l8 17"/>',
    hbo: '<path d="M2.5 7v10M6.5 7v10M2.5 12h4M9 7v10h2.7a2.5 2.5 0 0 0 0-5H9m0 0h2.3a2.5 2.5 0 0 0 0-5H9"/><circle cx="18.4" cy="12" r="3.4"/>',
    play: '<circle cx="12" cy="12" r="9"/><path d="M10 8.5v7l6-3.5z" class="fill"/>',
    music: '<path d="M9 18V5.5l11-2V16"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>',
    sources: '<rect x="3" y="4.5" width="18" height="12" rx="2"/><path d="M8 20h8M12 16.5V20M9.5 10.5h5M12.5 8.5l2 2-2 2"/>',
    apps: '<rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><rect x="14" y="14" width="6" height="6" rx="1.5"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'
  };

  function tileHtml(t, attrs) {
    return '<button class="tile" ' + attrs + '><svg viewBox="0 0 24 24">' + (TILE_ICONS[t.icon] || TILE_ICONS.play) +
      '</svg><span class="label">' + t.label + '</span></button>';
  }
  (function buildTiles() {
    var html = '';
    CFG.tiles.forEach(function (t) { html += tileHtml(t, 'data-id="' + t.id + '"'); });
    html += '<span class="sep"></span>';
    html += tileHtml({ label: 'Sources', icon: 'sources' }, 'data-action="inputs"');
    html += tileHtml({ label: 'Apps', icon: 'apps' }, 'data-action="apps"');
    html += tileHtml({ label: 'Settings', icon: 'settings' }, 'data-action="settings"');
    $('apps').innerHTML = html;
  })();

  var tiles = Array.prototype.slice.call(document.querySelectorAll('.tile'));
  var focus = 0;
  try { focus = Math.min(tiles.length - 1, parseInt(localStorage.getItem('focus'), 10) || 0); } catch (e) {}

  function setFocus(i) {
    focus = (i + tiles.length) % tiles.length;
    for (var k = 0; k < tiles.length; k++) tiles[k].className = tiles[k].className.replace(' focused', '');
    tiles[focus].className += ' focused';
    try { localStorage.setItem('focus', focus); } catch (e) {}
  }

  function toast(msg) {
    tell('/note?msg=' + encodeURIComponent(msg));
    var t = $('toast');
    t.textContent = msg;
    t.className = 'show';
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { t.className = ''; }, 2500);
  }

  // ---- background service (service/index.js): reopens Home when Samsung's home bar covers it ----
  var SERVICE_URL = 'http://127.0.0.1:47791';
  var SERVICE_ID = 'TizenZen01.Watcher';
  // The TV's local API knows preinstalled apps only by their Smart Hub id ("status" in config).
  // USER_APPS = apps the service watches; the browser is left out because it always runs hidden.
  var STATUS_ID = {}, USER_APPS = [];
  CFG.tiles.concat(CFG.moreApps).forEach(function (a) {
    if (!a.status) return;
    STATUS_ID[a.id] = a.status;
    if (a.id !== 'com.samsung.tv.knox-browser') USER_APPS.push(a.status);
  });

  function startService() {
    try {
      tizen.application.launchAppControl(new tizen.ApplicationControl('http://tizen.org/appcontrol/operation/service'),
        SERVICE_ID, null, null);
    } catch (e) { /* no service: Home button simply goes to Samsung's bar */ }
  }
  // tries > 1: resend on failure. Right after the TV wakes the first request can get lost, and a
  // lost /watch made the service think nothing was on screen and kick the person out of YouTube.
  function tell(path, tries) {
    if (!isTizen) return;
    var x = new XMLHttpRequest();
    x.open('GET', SERVICE_URL + path);
    x.timeout = 1500;
    x.onerror = x.ontimeout = function () {
      startService();   // not running yet (first start, crash): start it
      if (tries > 1) setTimeout(function () { tell(path, tries - 1); }, 700);
    };
    x.send();
  }
  // heartbeat: the service trusts this over the TV's local API, which lags after a wake
  setInterval(function () { if (!document.hidden) tell('/alive'); }, 1000);

  // ---- opening apps ----
  // untracked: the TV can't report this app (the App Store), so hand the screen over for 10 minutes
  function openApp(ids, name, untracked) {
    if (!isTizen) { toast('Would open ' + name); return; }
    var list = ids.slice();
    (function next() {
      var id = list.shift();
      if (!id) { toast('Could not open ' + name); return; }
      tell(untracked ? '/leave' : '/watch?id=' + encodeURIComponent(STATUS_ID[id] || id) + '&app=' + encodeURIComponent(id), 8);
      try { tizen.application.launch(id, null, next); } catch (e) { next(); }
    })();
  }

  // Samsung doesn't let normal apps open its Settings, so an optional helper on a home server
  // (tools/keyhelper.py) presses the remote's Settings key. The menu opens on top of Home.
  var KEY_HELPER = CFG.keyHelper;
  function openSamsungMenu() {
    if (!isTizen) { toast('Would open Samsung settings'); return; }
    if (!KEY_HELPER) { toast('Press Home on the remote, then the gear on the left'); return; }
    var x = new XMLHttpRequest();
    x.open('GET', KEY_HELPER + '/menu');
    x.timeout = 6000;
    x.onload = function () { if (x.status !== 200) toast('Could not open Settings'); };
    x.onerror = x.ontimeout = function () { toast('Settings helper is not answering'); };
    x.send();
  }

  // ---- small pickers under the tiles: Sources (HDMI ports) and Apps (other installed apps) ----
  // Each item: { label, off, run }.
  var items = [], itemFocus = 0, pickerOpen = false, watchingInput = false;

  function renderPicker() {
    var html = '';
    for (var i = 0; i < items.length; i++) {
      html += '<div class="input' + (i === itemFocus ? ' focused' : '') + (items[i].off ? ' off' : '') + '">' +
        items[i].label + '</div>';
    }
    $('picker').innerHTML = html || '<div class="input">Nothing found</div>';
  }

  function openPicker(list) {
    items = list;
    pickerOpen = true;
    itemFocus = 0;
    for (var i = 0; i < items.length; i++) if (!items[i].off) { itemFocus = i; break; }
    renderPicker();
    $('picker').className = 'show';
  }
  function closePicker() { pickerOpen = false; $('picker').className = ''; }

  // Samsung blocks normal apps from opening its own Apps screen, so list the other apps here.
  function openAppsPicker() {
    openPicker(CFG.moreApps.map(function (a) {
      return { label: a.label, run: function () { closePicker(); openApp([a.id], a.label, a.untracked); } };
    }));
  }

  // HDMI shown full screen inside Home, so the service never mistakes it for "left".
  // Every HDMI port is listed, not only "connected" ones: a sleeping PS5 counts as disconnected
  // but wakes when its port is selected. Live TV is left out (no aerial).
  function inputName(s) { return s.editName || s.type + ' ' + s.number; }

  function openSourcesPicker() {
    function show(list) {
      openPicker(list.map(function (s) {
        return { label: inputName(s), off: !s.connected, run: function () { showInput(s); } };
      }));
    }
    if (!isTizen || !tizen.systeminfo) return show([{ type: 'HDMI', number: 1 }, { type: 'HDMI', number: 2, connected: true }]);
    try {
      tizen.systeminfo.getPropertyValue('VIDEOSOURCE', function (info) {
        function tag(list, on) {
          return (list || []).filter(function (s) { return s.type === 'HDMI'; })
            .map(function (s) { return { raw: s, type: s.type, number: s.number, editName: s.editName, connected: on }; });
        }
        show(tag(info.connected, true).concat(tag(info.disconnected, false))
          .sort(function (a, b) { return a.number - b.number; }));
      }, function () { show([]); });
    } catch (e) { show([]); }
  }

  function showInput(s) {
    closePicker();
    if (!isTizen || !tizen.tvwindow) { toast('Would switch to ' + inputName(s)); return; }
    try {
      tizen.tvwindow.setSource(s.raw, function () {
        tizen.tvwindow.show(function () {
          watchingInput = true;
          stopVideo();
          document.body.className = 'tv';
          toast(inputName(s) + '  ·  Back = Home');
          document.documentElement.style.background = 'transparent';
        }, function (e) { toast('Could not show ' + inputName(s) + ' (' + (e && e.message) + ')'); }, ['0px', '0px', '1920px', '1080px'], 'MAIN');
      }, function (e) { toast('Could not switch input (' + (e && e.message) + ')'); }, 'MAIN');
    } catch (e) { toast('Could not switch input (' + e.message + ')'); }
  }

  function leaveInput() {
    watchingInput = false;
    document.body.className = '';
    document.documentElement.style.background = '';
    try { tizen.tvwindow.hide(function () {}, function () {}, 'MAIN'); } catch (e) {}
    wakeVideo();
  }

  function launch(tile) {
    var action = tile.getAttribute('data-action'), name = tile.textContent.trim();
    if (action === 'inputs') return openSourcesPicker();
    if (action === 'apps') return openAppsPicker();
    if (action === 'settings') return openSamsungMenu();
    openApp(tile.getAttribute('data-id').split(' '), name);
  }

  if (isTizen) {
    try { tizen.tvinputdevice.registerKey('ColorF2Yellow'); } catch (e) {}
  }

  document.addEventListener('keydown', function (e) {
    var k = e.keyCode;
    if (watchingInput) {                              // any of OK / Back returns from HDMI to Home
      if (k === 10009 || k === 13) { leaveInput(); e.preventDefault(); }
      return;
    }
    wakeVideo();
    if (pickerOpen) {
      if (k === 37) itemFocus = Math.max(0, itemFocus - 1);
      else if (k === 39) itemFocus = Math.min(items.length - 1, itemFocus + 1);
      else if (k === 13 && items[itemFocus]) return items[itemFocus].run();
      else if (k === 10009) return closePicker();
      else return;
      renderPicker();
      e.preventDefault();
      return;
    }
    switch (k) {
      case 37: setFocus(focus - 1); break;            // left
      case 39: setFocus(focus + 1); break;            // right
      case 13: launch(tiles[focus]); break;           // OK
      case 405: toggleVideo(); break;                 // yellow
      case 10009: break;                              // Back: this is home, stay here
      default: return;
    }
    e.preventDefault();
  });
  tiles.forEach(function (t, i) {
    t.addEventListener('click', function () { setFocus(i); launch(t); });
  });

  // Leaving for YouTube/Jellyfin frees the video; coming back refreshes clock, video and (if stale) weather.
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { tell('/hidden'); releaseVideo(); bg.className = ''; return; }
    tell('/home');
    reportApps();
    tickClock();
    lastInput = Date.now();
    if (watchingInput) return;
    if (videoStopped) wakeVideo();
    else playNext();
    if (!weather || Date.now() - weather.fetchedAt > WEATHER_EVERY_MS) loadWeather();
  });

  // ---- start ----
  try { weather = JSON.parse(localStorage.getItem('weather')); } catch (e) { weather = null; }
  window.addEventListener('resize', fit);
  fit();
  setFocus(focus);
  renderWeather();
  tickClock();
  loadWeather();
  playNext();
  // the service may start after us (first boot, crash), so keep it informed
  function reportApps() { tell('/apps?ids=' + USER_APPS.join(',')); }
  reportApps();
  setInterval(reportApps, 60000);
  setInterval(tickClock, 10000);
  setInterval(loadWeather, WEATHER_EVERY_MS);
})();
