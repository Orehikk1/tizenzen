'use strict';
// Background service that keeps the Home app in front, like the TV's own home screen.
// Adapted from AeroTizen's HomeWatcher (MIT, (c) 2026 Hamza El Alaoui, github.com/helalaou/AeroTizen).
//
// Hidden web apps are frozen on retail Samsung TVs, so the watching runs here, as a Tizen web
// service started at boot. Every 300 ms it asks the TV's local API (port 8001) whether Home is
// on screen and reclaims the screen when something it didn't choose covers it:
//   - Samsung's home bar at boot or after Home was pressed: Home hidden, no app opened -> reopen.
//   - Home pressed inside an app Home opened: that app went visible -> hidden -> reopen.
//   - An app that starts on its own (cast from a phone): newly running -> leave it alone.
//   - AirPlay / screen mirroring / a video shared from a phone: invisible to the local API, found in
//     the app contexts -> leave it alone, even when it lands on top of an app Home opened.
// HDMI is shown inside the Home app (tvwindow), so watching the PS5 never looks like "covered".
// After the TV wakes from standby (remote power button) the local API can take about a minute to
// come back, so a wake is detected from the timer gap and Home is opened at once via the Tizen API.
// The Home app talks to this service on port 47791; GET / on the LAN shows state and a short log.

var http = require('http');

var SELF = 'TizenZen01.Home';
var PORT = 47791;
var LEAVE_MS = 10 * 60 * 1000;  // "Samsung menu" hands the TV back for this long
var state = {
  watched: null, seen: false, leavingUntil: 0,
  apps: [], running: {}, selfVisible: null, hiddenSince: 0, watchAt: 0, lastLaunch: 0, last: null,
  log: []
};
var WAKE_GAP_MS = 5000;
var COVER_GRACE_MS = 6000;  // nothing on screen this long -> Samsung's bar is showing (slow apps like Jellyfin need ~4 s to report)
var LEAVE_GRACE_MS = 800;   // app gone from screen this long -> it was left  // timers freeze in standby; a gap this long means the TV just woke
var lastTick = Date.now();

function note(msg) {
  state.last = msg;
  state.log.push(new Date().toISOString().slice(11, 19) + ' ' + msg);
  if (state.log.length > 40) state.log.shift();
}

function get(path, cb) {
  var req = http.get({ host: '127.0.0.1', port: 8001, path: path, timeout: 1500 }, function (res) {
    var body = '';
    res.on('data', function (c) { body += c; });
    res.on('end', function () {
      var s = null; try { s = JSON.parse(body); } catch (e) {}
      cb(s && s.running !== undefined ? s : null);
    });
  });
  req.on('error', function () { cb(null); });
  req.on('timeout', function () { req.destroy(); });
}

function appStatus(id, cb) { get('/api/v2/applications/' + encodeURIComponent(id), cb); }

function snapshot(cb) {
  var out = {}, left = state.apps.length;
  if (!left) { return cb(out); }
  state.apps.forEach(function (id) {
    appStatus(id, function (s) {
      out[id] = !!(s && s.running);
      if (s && s.visible) { out.__visible = id; }
      if (--left === 0) { cb(out); }
    });
  });
}

// AirPlay / screen mirroring from a Mac or iPhone, and a video sent from a phone, are Samsung system
// screens. The local API says they are not running even while on screen, but they do show up in the
// Tizen app contexts (mirroring: the AirPlay apps; a shared video: Samsung's video player).
// A context can drop out for a moment mid-cast, so the cast only counts as ended
// after CAST_END_MS without any of them.
var CAST_APPS = ['com.samsung.tv.airplay-app', 'NRi6kdBYJ0.AirPlayWebApp', 'org.tizen.video-player-tv'];
var CAST_END_MS = 5000;
function castOn(cb) {
  try {
    tizen.application.getAppsContext(function (ctx) {
      state.contexts = ctx.map(function (c) { return c.appId; });
      cb(ctx.some(function (c) { return CAST_APPS.indexOf(c.appId) >= 0; }));
    }, function () { cb(false); });
  } catch (e) { cb(false); }
}

function launchSelf(why) {
  // Rate-limited so a failing relaunch can't loop. The TV's local API ignores launch requests
  // coming from the TV itself, so this uses the Tizen application API.
  if (Date.now() - state.lastLaunch < 2000) { return; }
  state.lastLaunch = Date.now();
  state.watched = null;
  try {
    tizen.application.launch(SELF, function () { note('reopened: ' + why); },
                             function (e) { note('reopen failed: ' + (e && e.message)); });
  } catch (e) {
    note('reopen threw: ' + e.message);
  }
}

function onWake() {
  note('TV woke up');
  state.watched = null; state.leavingUntil = 0; state.lastLaunch = 0;
  launchSelf('wake');
  // the TV may still be busy restoring the last screen; repeat once it has settled
  setTimeout(function () { state.lastLaunch = 0; launchSelf('wake +4s'); }, 4000);
  setTimeout(function () { state.lastLaunch = 0; launchSelf('wake +10s'); }, 10000);
}

var busy = false;
function tick() {
  var now0 = Date.now();
  if (now0 - lastTick > WAKE_GAP_MS) { lastTick = now0; return onWake(); }
  lastTick = now0;
  if (now0 < state.leavingUntil || busy) { return; }
  busy = true;
  setTimeout(function () { busy = false; }, 2500);  // never stay stuck if a request hangs
  appStatus(SELF, function (me) {
    busy = false;
    if (!me) { return; }
    var now = Date.now();
    if (me.visible) {
      state.selfVisible = true; state.hiddenSince = 0; state.watched = null; state.coveredSince = 0; state.castAt = 0;
      if (now - (state.snapAt || 0) > 5000) { state.snapAt = now; snapshot(function (r) { delete r.__visible; state.running = r; state.haveBaseline = true; }); }
      return;
    }
    if (state.selfVisible !== false) { state.hiddenSince = now; }
    state.selfVisible = false;

    if (state.watched) {
      appStatus(state.watched, function (s) {
        if (!s || !state.watched) { return; }
        var t = Date.now();
        if (s.visible) { state.seen = true; state.goneSince = 0; return; }
        if (state.seen) {
          // gone from the screen; wait a moment so a brief overlay doesn't count as leaving
          if (!state.goneSince) { state.goneSince = t; return; }
          if (t - state.goneSince < LEAVE_GRACE_MS) { return; }
          // a video cast from a phone covers the app without closing it: hand over to the cast check
          castOn(function (cast) {
            if (!state.watched || !state.goneSince) { return; }
            state.goneSince = 0;
            if (cast) {
              note('stand aside: cast over ' + state.watched);
              state.watched = null; state.castAt = Date.now(); state.coveredSince = 0;
              return;
            }
            launchSelf('left ' + state.watched);
          });
        } else if (t - state.watchAt > 20000) {
          launchSelf(state.watched + ' never showed up');   // failed launch: don't leave a blank screen
        }
      });
      return;
    }
    // Hidden and nothing opened by Home. Apps take a moment to report themselves, so only
    // reclaim the screen after nothing has been on it for COVER_GRACE_MS.
    if (now - state.hiddenSince < 250 || now - state.watchAt < 2500) { return; }
    snapshot(function (r) {
      var t = Date.now();
      if (!state.haveBaseline) {
        // first look after start: apps already running in the background are not "just opened"
        state.haveBaseline = true;
        state.running = r;
        delete r.__visible;
        return;
      }
      if (r.__visible) {
        state.watched = r.__visible; state.seen = true; state.coveredSince = 0; delete r.__visible; state.running = r;
        note('stand aside: ' + state.watched + ' is on screen');
        return;
      }
      for (var id in r) {
        if (r[id] && !state.running[id]) {
          state.watched = id; state.seen = false; state.watchAt = t; state.coveredSince = 0; state.running = r;
          note('stand aside: ' + id + ' started');
          return;
        }
      }
      state.running = r;
      castOn(function (cast) {
        var t2 = Date.now();
        if (cast) {
          if (!state.castAt) { note('stand aside: cast / AirPlay'); }
          state.castAt = t2; state.coveredSince = 0;
          return;
        }
        if (state.castAt) {
          if (t2 - state.castAt < CAST_END_MS) { return; }
          state.castAt = 0; launchSelf('cast ended');
          return;
        }
        if (!state.coveredSince) { state.coveredSince = t2; return; }
        if (t2 - state.coveredSince >= COVER_GRACE_MS) { state.coveredSince = 0; launchSelf('covered without an app'); }
      });
    });
  });
}

module.exports.onStart = function () {
  http.createServer(function (req, res) {
    var url = require('url').parse(req.url, true), q = url.query;
    if (url.pathname === '/watch') {
      state.watched = q.id || null; state.seen = false; state.leavingUntil = 0; state.watchAt = Date.now();
      note('watching ' + state.watched);
    } else if (url.pathname === '/apps') {
      state.apps = (q.ids || '').split(',').filter(Boolean);
    } else if (url.pathname === '/leave') {
      state.leavingUntil = Date.now() + LEAVE_MS; state.watched = null;
      note('handed to Samsung for 10 min');
    } else if (url.pathname === '/note') {
      note('app: ' + (q.msg || ''));
    } else if (url.pathname === '/ctx') {
      try {
        tizen.application.getAppsContext(function (ctx) {
          res.writeHead(200, { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' });
          res.end(JSON.stringify(ctx.map(function (c) { return c.appId; })));
        }, function (e) { res.writeHead(500); res.end(String(e && e.message)); });
      } catch (e) { res.writeHead(500); res.end(e.message); }
      return;
    } else if (url.pathname === '/home') {
      state.leavingUntil = 0; state.watched = null;
    }
    res.writeHead(200, { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' });
    res.end(JSON.stringify(state));
  }).listen(PORT, '0.0.0.0');
  note('service started');
  setInterval(tick, 300);
  // Started at boot (on-boot="true"): open Home so the TV comes up on it.
  setTimeout(function () { launchSelf('boot'); }, 3000);
};

module.exports.onRequest = function () {};
module.exports.onExit = function () {};
