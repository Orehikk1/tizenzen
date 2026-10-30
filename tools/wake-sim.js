#!/usr/bin/env node
// Runs app/service/index.js on this computer with a fake clock, a fake TV API (port 8001) and a fake
// tizen object, through the wake-up cases that kicked people out of YouTube (PITFALLS 16).
// Usage: node tools/wake-sim.js        (prints each case and PASS / FAIL)
process.noDeprecation = true;
const Module = require('module');
const path = require('path').join(__dirname, '..', 'app', 'service', 'index.js');
let now = 1e12; Date.now = () => now;
const timers = []; let tid = 0;
global.setTimeout = (f, ms) => { timers.push({ id: ++tid, at: now + ms, f }); return tid; };
global.setInterval = (f, ms) => { const t = { id: ++tid, at: now + ms, f, every: ms }; timers.push(t); return tid; };
let tv = {};            // id -> {running, visible} as the API reports
let apiDown = false, contexts = [], power = 'on';
const launches = [];
global.tizen = { application: {
  launch: (id, ok) => { launches.push(((now - T0) / 1000).toFixed(1) + 's'); ok && ok(); },
  getAppsContext: (ok) => ok(contexts.map(a => ({ appId: a }))) } };
let handler;
const http = { get: (o, cb) => {
    const id = decodeURIComponent(o.path.split('/').pop()); const ev = {};
    const res = { on: (e, f) => { ev[e] = f; } };
    const req = { on: (e, f) => { if (e === 'error' && apiDown) f(new Error('x')); }, destroy() {} };
    const body = o.path === '/api/v2/' ? { device: { PowerState: power } } : (tv[id] || { running: false, visible: false });
    if (!apiDown) { cb(res); ev.data(JSON.stringify(body)); ev.end(); }
    return req; },
  createServer: (h) => { handler = h; return { listen() {} }; } };
const orig = Module.prototype.require;
Module.prototype.require = function (n) { return n === 'http' ? http : orig.apply(this, arguments); };
const svc = require(path);
function call(p) { let out; handler({ url: p }, { writeHead() {}, end(b) { out = b; } }); return out; }
function run(ms) { const end = now + ms; for (;;) { timers.sort((a, b) => a.at - b.at); const t = timers[0];
  if (!t || t.at > end) break; now = t.at; if (t.every) t.at += t.every; else timers.shift(); t.f(); } now = end; }
let T0;
function standby(ms) { now += ms; timers.forEach(t => { if (t.at < now) t.at = now + 1; }); T0 = now; }
function scenario(name, fn) {
  timers.length = 0; launches.length = 0; tv = {}; apiDown = false; contexts = []; power = 'on';
  delete require.cache[require.resolve(path)]; const s = require(path); s.onStart();
  call('/apps?ids=111299001912,AprZAARz4r.Jellyfin');
  tv['TizenZen01.Home'] = { running: true, visible: true }; tv['111299001912'] = { running: true, visible: false };
  run(300000);              // settle after boot
  const st = JSON.parse(call('/x'));
  launches.length = 0; T0 = now; fn(st);
  const log = JSON.parse(call('/x')).log.slice(-12);
  console.log('\n== ' + name + '\nreopens: ' + JSON.stringify(launches)); log.forEach(l => console.log('   ' + l));
  return launches.length;
}
let fail = 0;
function expect(name, got, want) { if (got !== want) { fail = 1; console.log('   FAIL: ' + got + ' reopens, want ' + want); } }
let hb; const beat = (on) => { hb = on; };
function heartbeatLoop() { setInterval(() => { if (hb) call('/alive'); }, 1000); }

// A: morning. TV wakes, Home up, person taps YouTube tile at +6 s. API stale 2 min: says everything hidden.
expect('A', scenario('A wake, tap YouTube tile at 6s, API stale', () => {
  heartbeatLoop(); beat(false); run(10); standby(30000000);  // standby gap
  tv['TizenZen01.Home'] = { running: true, visible: false }; tv['111299001912'] = { running: true, visible: false };
  contexts = ['com.samsung.tv.cobalt-yt'];
  run(400); beat(true); run(5600);
  beat(false); call('/watch?id=111299001912&app=9Ur5IzDKqV.TizenYouTube'); run(120000);
  tv['111299001912'] = { running: true, visible: true }; run(30000);
}), 1);
// B: same but the /watch never arrives (opened some other way).
expect('B', scenario('B wake, YouTube opened without /watch, API stale', () => {
  heartbeatLoop(); beat(false); run(10); standby(30000000);
  tv['TizenZen01.Home'] = { running: true, visible: false };
  run(400); beat(true); run(5600); beat(false); run(150000);
}), 1);
// C: wake, Home never shows (TV restoring something), no app: retries must fire.
expect('C', scenario('C wake, Home never shows up', () => {
  heartbeatLoop(); beat(false); run(10); standby(30000000);
  tv['TizenZen01.Home'] = { running: true, visible: false }; run(30000);
}), 4);
// D: normal day, Samsung bar covers Home, nothing opened: reclaim (Home stays hidden in this fake, so twice).
expect('D', scenario('D no wake, covered by Samsung bar', () => {
  heartbeatLoop(); beat(true); run(3000); beat(false);
  tv['TizenZen01.Home'] = { running: true, visible: false }; run(15000);
}), 2);
// E: normal day, YouTube opened from tile, then left with Home key.
expect('E', scenario('E no wake, YouTube then left', () => {
  heartbeatLoop(); beat(true); run(3000); beat(false); call('/watch?id=111299001912&app=9Ur5IzDKqV.TizenYouTube');
  tv['TizenZen01.Home'] = { running: true, visible: false }; run(2000);
  tv['111299001912'] = { running: true, visible: true }; run(10000);
  tv['111299001912'] = { running: true, visible: false }; run(5000);
}), 1);

// F: light standby (the service keeps running, no timer gap). YouTube was on screen when the TV went
// to standby; at power-on the API says YouTube is gone. Person taps the YouTube tile at 6 s.
expect('F', scenario('F light standby, power on, tap YouTube tile at 6s, API stale', () => {
  heartbeatLoop(); beat(false); call('/watch?id=111299001912&app=9Ur5IzDKqV.TizenYouTube');
  tv['TizenZen01.Home'] = { running: true, visible: false }; tv['111299001912'] = { running: true, visible: true };
  run(5000); power = 'standby'; run(600000); T0 = now;
  power = 'on'; tv['111299001912'] = { running: true, visible: false };
  run(1500); beat(true); run(4500);
  beat(false); call('/watch?id=111299001912&app=9Ur5IzDKqV.TizenYouTube'); run(120000);
}), 1);
// G: light standby, power on, YouTube comes back by itself (TV restores it), no tile press.
expect('G', scenario('G light standby, power on, API stale, nothing pressed', () => {
  heartbeatLoop(); beat(false);
  tv['TizenZen01.Home'] = { running: true, visible: false }; tv['111299001912'] = { running: true, visible: true };
  run(5000); power = 'standby'; run(600000); T0 = now;
  power = 'on'; tv['111299001912'] = { running: true, visible: false };
  run(1500); beat(true); run(3000); beat(false); run(120000);
}), 1);
console.log(fail ? '\nFAIL' : '\nPASS'); process.exit(fail);
