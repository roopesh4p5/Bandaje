// BANDAJE FALLS EXPEDITION (Joint Travellers) — fully automatic reel. No taps needed: it plays, shows the holograms,
// reaches the falls and loops. (Hidden keys for recording: Space = pause, R = restart.)
//
// Story: Malnad homestay → pickup ride through coffee/areca estates into Kelagur tea estate
// (flora/fauna holograms) → everyone jumps down → memories → 14 km group trek through Western Ghats
// evergreen forest, across a Netravathi stream, over the Rani Jhari ridge → Bandaje falls (Durgadahalli).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildWorld, MARK } from './js/world.js';
import { loadMedia, loadExtra, groupsOf, showHolo, hideHolo, placeBeam } from './js/media.js';
import { makeGames, CRICKET_PERIOD } from './js/games.js';
import { makeCampfire } from './js/campfire.js';
import { makeTruck, BED } from './js/truck.js';
import { makePerson, poseRide, poseWalk, poseIdle, poseJump } from './js/characters.js';
import { softTex } from './js/textures.js';
import { createSoundtrack } from './js/audio.js';

// ---- tune the reel here ----
const CONFIG = {
  driveSpeed: 8,     // pickup speed (m/s of scene time)
  walkSpeed: 7,       // group trekking speed
  people: 20,
  logoIntro: 1,       // Joint Travellers logo card at the start of every play
  hutHold: 3.4,       // opening shot of the stay (the logo covers its first second)
  gamesIntro: 3, cricket: CRICKET_PERIOD * 3, lagori: 12,
  campfire: 9, stargaze: 8, // night at the stay: around the fire, then looking up at the stars
  speciesHold: 4.8,   // each flora/fauna hologram group (2–3 cards)
  disembark: 6.8,     // everyone hopping off the pickup
  memoryHold: 3.6,    // each photo memory (videos play up to maxVideo seconds)
  maxVideo: 8,
  finaleHold: 5,
  endHold: 6,
  trekKm: 14,         // HUD counter runs 0 → 14 km once the walk starts
  elevBase: 480, elevScale: 3.1,
};

const params = new URLSearchParams(location.search);
const $ = id => document.getElementById(id);
const game = $('game'), canvas = $('world');
const UP = new THREE.Vector3(0, 1, 0);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = .82;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(52, 9 / 16, .3, 12000);
let sound, composer, world, timeline, media, orb, guide, holoCone, rig, people = [], dust = [];
let sTruck = 0, sWalk = 0, sPark = 12; // where the pickup parks / where the walking group starts / parked at the stay
let games, camp, extra = {};

const status = t => { const s = $('loadingText'); if (s) s.textContent = t; };
const nextFrame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));

async function init() {
  status('GENERATING TERRAIN');
  await nextFrame();
  world = buildWorld(scene, renderer, { quality: params.get('q') || 'high' });
  status('SCANNING FIELD ARCHIVE');
  media = await loadMedia();
  const ex = await loadExtra([
    { key: 'up', src: 'assets/web/jeepselfieup.jpg', label: 'JEEP SELFIE · ALL OF US' },
    { key: 'down', src: 'assets/web/jeepselfiedown.jpg', label: 'JEEP SELFIE · ON BOARD' },
    { key: 'tea', src: 'assets/web/teastate.jpg', label: 'KELAGUR TEA ESTATE' },
    { key: 'cricket', src: 'assets/web/cricket.mp4', label: 'CRICKET AT THE GROUND', dur: 4 },
    { key: 'lagori', src: 'assets/web/lagori.mp4', label: 'LAGORI AT THE GROUND', dur: 7.5 },
    { key: 'climb', src: 'assets/web/climb.mp4', label: 'THE CLIMB', layout: 'tall', full: true, stage: 'trek', dur: 8.4 },
    { key: 'breakfast', src: 'assets/web/breakfast.mp4', label: 'BREAKFAST AT THE WATERFALL', layout: 'tall', full: true, dur: 9.7 },
  ]);
  ex.forEach((m, i) => { m.index = i + 1; m.duration ||= m.dur; extra[m.key] = m; }); // dur: fallback if the clip's length hasn't loaded yet
  ['home', 'drive', 'tea', 'camp', 'trek', 'falls'].flatMap(k => media.memories[k]).forEach(m => m.index += ex.length);
  media.total.memories += ex.length;
  $('photoCount').textContent = `${media.total.species} SPECIES · ${media.total.memories} MEMORIES`;
  sTruck = S(MARK.teaEnd);
  sWalk = sTruck + 4 + Math.ceil(CONFIG.people / 2) * 1.8 + 2;
  timeline = buildTimeline();
  buildTrekker();
  buildCrew();
  games = makeGames(scene, world, people);
  camp = makeCampfire(scene, world, people, games);

  composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), .28, .5, .9));
  composer.addPass(new OutputPass());
  resize();
  addEventListener('resize', resize);
  addEventListener('keydown', e => {
    if (e.code === 'Space') { e.preventDefault(); paused = !paused; }
    if (e.key.toLowerCase() === 'r') restart();
    if (e.key.toLowerCase() === 'm') sound.toggleMute();
    if (e.key.toLowerCase() === 'f') toggleFullscreen();
  });
  game.addEventListener('dblclick', toggleFullscreen);

  // soundtrack: starts by itself where the browser allows autoplay, otherwise on the first click/key
  sound = createSoundtrack();
  const unlock = async () => { if (await sound.start()) $('soundHint').classList.add('off'); };
  sound.start().then(ok => { if (!ok && !params.has('freeze')) $('soundHint').classList.remove('off'); });
  ['pointerdown', 'pointerup', 'click', 'keydown', 'touchstart', 'touchend'].forEach(e => addEventListener(e, unlock, { capture: true }));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) unlock(); });

  clock = +(params.get('t') || 0);
  snap = true;
  requestAnimationFrame(loop);
  const ld = $('loading'); ld.style.opacity = '0'; setTimeout(() => ld.remove(), 800);
}

// ---------------------------------------------------------------------------------------------
// Story timeline
const S = i => world.route.ctrlS[i];
function buildTimeline() {
  const seg = [], cues = []; let t = 0, s = 0, phase = 'drive', ch = 1, park = sTruck, ws = sWalk, memNo = 0;
  const add = o => { o.t0 = t; t += o.dur; o.t1 = t; o.phase = phase; o.ch = ch; o.park = park; o.ws = ws; seg.push(o); return o; };
  const move = (to, extra) => {
    if (to - s < 1) return;
    const L = to - s, v = phase === 'drive' ? CONFIG.driveSpeed : CONFIG.walkSpeed;
    add({ type: 'move', s0: s, s1: to, L, dur: Math.max(L / v + 1.4, 2.8), ...extra }); s = to;
  };
  const hold = (dur, extra) => add({ type: 'hold', s0: s, s1: s, dur, ...extra });
  const jump = (to, extra) => { s = to; add({ type: 'hold', s0: s, s1: s, dur: .01, mode: 'hold', cut: true, ...extra }); };
  const memT = () => media.total.memories;
  const show = (g, items, o = {}) => { items = items.filter(Boolean); if (!items.length) return; if (o.big) items.forEach(m => m.index = ++memNo); cues.push({ t0: g.t0, t1: g.t1, items, ...o }); };
  const spread = (a, b, n) => Array.from({ length: n }, (_, i) => a + (b - a) * (i + 1) / (n + 1));
  const memDur = m => m.video ? Math.min(m.full ? 12 : CONFIG.maxVideo, Math.max(CONFIG.memoryHold, m.duration || 0)) : CONFIG.memoryHold;
  const M = media.memories;
  const memHold = (m, mode, extra) => show(hold(memDur(m), { mode, memory: m, ...extra }), [m], { big: true, total: memT(), layout: m.layout || '' });
  const groupHold = (grp, extra) => show(hold(CONFIG.speciesHold, { mode: 'hold', group: grp, ...extra }), grp, { total: media.total.species });
  const teaGroups = groupsOf(media.species.tea), trekGroups = groupsOf(media.species.trek);
  const L = (name, sub, next) => ({ name, sub, next });

  // ---- CHAPTER 1 · the stay → jeep ride (starts with the selfie) → explore Kelagur tea estate → back to the stay ----
  hold(CONFIG.hutHold, { mode: 'intro', loc: L('THE STAY', 'MALNAD HOMESTAY · BASE CAMP', 'KELAGUR TEA ESTATE') });
  const road = L('JEEP RIDE', 'EVERYONE IN THE JEEP · SELFIE TIME', 'KELAGUR TEA ESTATE');
  const g1 = add({ type: 'move', s0: 0, s1: 110, L: 110, dur: 110 / CONFIG.driveSpeed + 1.4, loc: road }); s = 110;
  const selfies = [extra.up, extra.down].filter(Boolean);
  if (selfies.length) cues.push({ t0: g1.t0 + .4, t1: g1.t1, items: selfies, total: memT(), layout: selfies.length > 1 ? 'pair' : '' });
  selfies.forEach(m => m.index = ++memNo);
  const teaPark = S(MARK.teaStart) + 40;
  park = teaPark; ws = teaPark + 4 + Math.ceil(CONFIG.people / 2) * 1.8 + 2;
  jump(teaPark - 75, { loc: L('KELAGUR TEA ESTATE', 'ENTERING THE ESTATE', 'TEA ESTATE STOP') });
  move(teaPark, { loc: L('KELAGUR TEA ESTATE', 'ENTERING THE ESTATE', 'TEA ESTATE STOP') });
  phase = 'disembark';
  const teaLoc = L('KELAGUR TEA ESTATE', 'EXPLORING THE TEA GARDENS', 'BACK TO THE STAY');
  hold(CONFIG.disembark, { mode: 'disembark', loc: teaLoc });
  phase = 'walk'; s = ws;
  if (extra.tea) memHold(extra.tea, 'memory', { loc: teaLoc });
  teaGroups.forEach(grp => { move(s + 22, { loc: teaLoc }); groupHold(grp, { loc: teaLoc }); });
  M.tea.forEach(m => memHold(m, 'memory', { loc: teaLoc }));

  // ---- CHAPTER 2 · back at the stay: cricket + lagori on the ground beside it ----
  ch = 2; phase = 'games'; s = sPark;
  hold(CONFIG.gamesIntro, { mode: 'gamesIntro', cut: true, loc: L('BACK AT THE STAY', 'THE GROUND BESIDE THE HUT', 'CRICKET') });
  const gc = hold(CONFIG.cricket, { mode: 'cricket', loc: L('CRICKET', 'THE GROUND · HOMESTAY', 'LAGORI') });
  if (extra.cricket) { extra.cricket.index = ++memNo; cues.push({ t0: gc.t0 + .4, t1: Math.min(gc.t1, gc.t0 + .4 + 2 * (extra.cricket.duration || 4)), items: [extra.cricket], total: memT(), big: true, layout: 'wide' }); }
  const gl = hold(Math.max(CONFIG.lagori, (extra.lagori?.duration || 0) + 1.5), { mode: 'lagori', cut: true, loc: L('LAGORI', 'SEVEN STONES · THE GROUND', 'CAMPFIRE') });
  if (extra.lagori) { extra.lagori.index = ++memNo; cues.push({ t0: gl.t0 + .4, t1: Math.min(gl.t1, gl.t0 + .4 + extra.lagori.duration + .5), items: [extra.lagori], total: memT(), big: true, layout: 'wide' }); }
  // night falls: campfire on chairs near the stay (any 'camp' memories show here), then stargazing
  const campLoc = L('CAMPFIRE NIGHT', 'AROUND THE FIRE · BESIDE THE STAY', 'STARGAZING');
  const campMem = M.camp || [], campDur = Math.max(CONFIG.campfire, campMem.reduce((a, m) => a + memDur(m), 0) + 1.2);
  const gf = hold(campDur, { mode: 'campfire', cut: true, night: true, loc: campLoc });
  let ct = gf.t0 + .8;
  campMem.forEach(m => { m.index = ++memNo; const d = memDur(m); cues.push({ t0: ct, t1: ct + d, items: [m], total: memT(), big: true }); ct += d; });
  hold(CONFIG.stargaze, { mode: 'stargaze', night: true, loc: L('STARGAZING', 'THE MILKY WAY OVER MALNAD', 'TREKKING POINT') });

  // ---- CHAPTER 3 · back in the jeep to the trekking point, everyone gets down, trek to the falls ----
  ch = 3; phase = 'drive'; park = sTruck; ws = sWalk;
  const toTrek = L('TO THE TREKKING POINT', 'EVERYONE BACK IN THE JEEP', 'TREK CHECKPOINT');
  jump(0, { loc: toTrek });
  move(110, { loc: toTrek });
  jump(sTruck - 110, { loc: L('JUNGLE ROAD', 'NEARLY AT THE CHECKPOINT', 'TREK CHECKPOINT') });
  move(sTruck, { loc: L('JUNGLE ROAD', 'NEARLY AT THE CHECKPOINT', 'TREK CHECKPOINT') });
  phase = 'disembark';
  hold(CONFIG.disembark, { mode: 'disembark', loc: L('TREK CHECKPOINT', 'EVERYONE GETS DOWN · TREK BEGINS', 'EVERGREEN FOREST') });
  phase = 'walk'; s = sWalk;
  // along the trek: flora/fauna groups and viewpoint memories take turns
  const stops = [], n = Math.max(trekGroups.length, M.trek.length);
  for (let i = 0; i < n; i++) { if (trekGroups[i]) stops.push({ group: trekGroups[i] }); if (M.trek[i]) stops.push({ memory: M.trek[i] }); }
  const cross = S(MARK.crossing);
  spread(S(MARK.forestStart) + 20, S(MARK.end) - 45, stops.length)
    .map(x => Math.max(x, sWalk + 30))
    .map(x => Math.abs(x - cross) < 55 ? (x < cross ? cross - 55 : cross + 55) : x)
    .forEach((x, k) => stops[k].at = x);
  // the climb video plays on the Rani Jhari climb; the nearest regular stop makes room for it
  if (extra.climb) {
    const at = S(MARK.climbStart) + 30, near = stops.reduce((b, st) => Math.abs(st.at - at) < Math.abs(b.at - at) ? st : b, stops[0] || { at: 1e9 });
    if (near && Math.abs(near.at - at) < 25) near.at = near.at < at ? at - 25 : at + 25;
    stops.push({ memory: extra.climb, at });
  }
  stops.sort((a, b) => a.at - b.at).forEach(st => { move(st.at); st.group ? groupHold(st.group) : memHold(st.memory, 'memory'); });
  move(world.route.len);
  hold(CONFIG.finaleHold, { mode: 'finale' });
  [...(extra.breakfast ? [extra.breakfast] : []), ...M.falls].forEach(m => memHold(m, 'finale'));
  hold(CONFIG.endHold, { mode: 'end' });

  cues.sort((a, b) => a.t0 - b.t0);
  const cuts = seg.filter(g => g.cut).map(g => g.t0);
  const tCricket = seg.find(g => g.mode === 'cricket').t0, tLagori = seg.find(g => g.mode === 'lagori').t0, tStars = seg.find(g => g.mode === 'stargaze').t0;
  console.info('[timeline]', seg.length, 'segments,', t.toFixed(1), 's', seg.filter(g => g.cut || g.night || g.memory?.full).map(g => `${g.mode}@${g.t0.toFixed(1)}`).join(' '));
  return { seg, cues, cuts, total: t, tCricket, tLagori, tStars };
}

function trap(t, D, L, ta = 1.4) {
  const v = L / (D - ta), a = v / ta;
  if (t <= 0) return 0; if (t >= D) return L;
  if (t < ta) return .5 * a * t * t;
  if (t > D - ta) { const r = D - t; return L - .5 * a * r * r; }
  return .5 * a * ta * ta + v * (t - ta);
}

function stateAt(t) {
  const segs = timeline.seg;
  let i = segs.findIndex(g => t < g.t1); if (i < 0) i = segs.length - 1;
  const g = segs[i], h = t - g.t0;
  const s = g.type === 'move' ? g.s0 + trap(h, g.dur, g.L) : g.s0;
  return { i, g, s, h, t, phase: g.phase, mode: g.type === 'move' ? 'follow' : g.mode };
}

// ---------------------------------------------------------------------------------------------
// Pickup + crew
const tmpV = new THREE.Vector3();
let lastTruckS = 0, truckVel = 0, truckAcc = 0, lastYaw = 0, yawRate = 0;

function buildCrew() {
  rig = makeTruck();
  scene.add(rig.truck);
  const cols = 4, rows = Math.ceil(CONFIG.people / cols);
  for (let i = 0; i < CONFIG.people; i++) {
    const p = makePerson(i + 1), r = Math.floor(i / cols), c = i % cols;
    p.bed = new THREE.Vector3(BED.x0 + .2 + c * (BED.x1 - BED.x0 - .4) / (cols - 1) + p.jit * .08, BED.floor, BED.z1 - .3 - r * (BED.z1 - BED.z0 - .5) / (rows - 1) + p.jit * .06);
    p.bedYaw = (c === 0 ? -.45 : c === cols - 1 ? .45 : 0) + p.jit * .9;
    if (c === 0) p.armPoses[0] = 'rail';           // people on the edges grab the side rail
    if (c === cols - 1) p.armPoses[1] = 'rail';
    p.order = i;
    p.cyc = p.ph;
    people.push(p);
  }
  // Trek groups: a solo guide up front, then a mix of couples, small groups and solo walkers.
  const sizes = [1, 3, 2, 1, 4, 2, 3, 1, 2, 1], clusters = [];
  let idx = 0, gap = 0;
  const order = [...people].sort((a, b) => a.rnd - b.rnd);
  sizes.forEach((n, ci) => {
    if (idx >= order.length) return;
    const members = order.slice(idx, idx + n); idx += n;
    const cl = { base: gap, n: members.length, ph: ci * 1.7, couple: members.length === 2 };
    members.forEach((m, k) => {
      m.cluster = cl;
      m.inOff = (k % 2) * .9 + Math.floor(k / 2) * 1.3 + m.jit * .5;                    // stagger inside the group
      m.lat = members.length === 1 ? m.jit * 1.2 : ((k % 2 ? 1 : -1) * (.45 + Math.abs(m.jit) * .4));
      m.pace = 1 + m.jit * .12;
    });
    gap += members.length * 1.0 + 1.5 + ((ci * 7919) % 4);                                 // open space before the next group
    clusters.push(cl);
  });
  order.slice(idx).forEach((m, k) => { m.cluster = clusters[clusters.length - 1]; m.inOff = 2 + k; m.lat = m.jit; m.pace = 1; });
  const tex = softTex();
  for (let i = 0; i < 26; i++) {
    const d = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xb98a62, transparent: true, opacity: 0, depthWrite: false }));
    d.userData.ph = i / 26; scene.add(d); dust.push(d);
  }
}

function placeTruck(st, t, dt) {
  const s = st.phase === 'drive' ? st.s : st.phase === 'games' ? sPark : sTruck;
  if (Math.abs(s - lastTruckS) > 15) { lastTruckS = s; truckVel = 0; truckAcc = 0; } // a cut, not a launch
  const R = world.route, H = world.heightAt, { p, dir } = R.at(s);
  const side = new THREE.Vector3(-dir.z, 0, dir.x);
  const f = p.clone().addScaledVector(dir, 2.05), b = p.clone().addScaledVector(dir, -1.55);
  const hf = H(f.x, f.z), hb = H(b.x, b.z), hl = H(p.x + side.x * .9, p.z + side.z * .9), hr = H(p.x - side.x * .9, p.z - side.z * .9);
  const yaw = Math.atan2(dir.x, dir.z);
  if (Math.abs(s - lastTruckS) < 1e-6 && dt > 0) lastYaw = yaw;
  // the whole truck sits on the plane through its wheel contacts
  rig.truck.position.set(p.x, (hf + hb) / 2 + .02 - Math.abs(hf - hb) * .02, p.z);
  rig.truck.rotation.set(-Math.atan2(hf - hb, 3.6), yaw, -Math.atan2(hl - hr, 1.8), 'YXZ');
  rig.truck.updateMatrixWorld();
  const v = dt > 0 ? (s - lastTruckS) / dt : 0;
  truckAcc += ((dt > 0 ? (v - truckVel) / dt : 0) - truckAcc) * Math.min(1, dt * 4);
  truckVel = v; lastTruckS = s;
  yawRate += ((dt > 0 ? Math.atan2(Math.sin(yaw - lastYaw), Math.cos(yaw - lastYaw)) / dt : 0) - yawRate) * Math.min(1, dt * 4); lastYaw = yaw;
  const moving = Math.min(1, Math.abs(v) / 4), shake = .15 + moving * .85;
  // suspension: each wheel finds the ground under it; the body shakes on top
  rig.hubs.forEach(h => {
    h.position.y = .45;
    h.getWorldPosition(tmpV);
    const off = THREE.MathUtils.clamp(H(tmpV.x, tmpV.z) + .45 - tmpV.y, -.18, .18);
    h.position.y = .45 + off;
  });
  rig.wheels.forEach(w => w.rotation.x = s / .46);
  const bump = Math.sin(t * 23) * .5 + Math.sin(t * 37 + 1) * .3 + Math.sin(s * 1.7) * .6;
  rig.body.position.y = bump * .02 * shake;
  rig.body.rotation.x = Math.sin(t * 17 + s) * .008 * shake - truckAcc * .004;
  rig.body.rotation.z = Math.sin(t * 13 + s * .7) * .012 * shake;
  // dust kicked up behind the rear wheels
  dust.forEach(d => {
    const k = (t * .9 + d.userData.ph) % 1;
    const o = b.clone().addScaledVector(dir, -1 - k * 6).addScaledVector(side, (d.userData.ph - .5) * 2.4);
    d.position.set(o.x, H(o.x, o.z) + .3 + k * 1.4, o.z);
    d.scale.setScalar(1 + k * 3.5);
    d.material.opacity = Math.sin(k * Math.PI) * .32 * moving;
  });
  return { shake, moving };
}

// Where a trekker wants to be: behind the leader by their group's gap (which breathes over time),
// bunched up and spread across the trail when the group stops.
function trekTarget(pp, sLead, t, stopped) {
  const cl = pp.cluster;
  const breathe = Math.sin(t * .11 + cl.ph) * 2.2 + Math.sin(t * .23 + cl.ph * 2) * 1.2;
  const off = stopped ? (cl.base * .45 + pp.inOff * .8) : (cl.base + pp.inOff + breathe * Math.min(1, cl.base / 6));
  return { s: sLead - Math.max(0, off), lat: stopped ? pp.lat * 1.8 + pp.jit * .6 : pp.lat + Math.sin(t * .3 + pp.ph) * .15 };
}

function trailPoint(s, lat) {
  const { p, dir } = world.route.at(s), side = new THREE.Vector3(-dir.z, 0, dir.x);
  p.addScaledVector(side, lat); p.y = world.heightAt(p.x, p.z);
  return { p, dir };
}

function updateCrew(st, t, dt, truckState, simDt) {
  if (st.mode === 'campfire' || st.mode === 'stargaze') {
    games.hide();
    camp.update(st.mode, st.mode === 'stargaze' ? st.t - timeline.tStars : st.h, t);
    people.forEach(pp => { pp.trek = null; });
    return { center: camp.center(), rear: sTruck, front: sTruck };
  }
  camp.hide();
  if (st.phase === 'games') {
    const g = st.g, lag = st.mode === 'lagori';
    games.update(lag ? 'lagori' : 'cricket', lag ? st.t - timeline.tLagori : st.t - timeline.tCricket, t);
    people.forEach(pp => { pp.trek = null; });
    return { center: games.center(), rear: sTruck, front: sTruck };
  }
  games.hide();
  const disT = st.phase === 'disembark' ? st.h : 0;
  const sLead = st.phase === 'walk' ? st.s : sWalk;
  const stopped = st.phase !== 'walk' || st.g.type !== 'move';
  const sway = { x: THREE.MathUtils.clamp(truckAcc * .035, -.25, .25), z: THREE.MathUtils.clamp(-yawRate * truckVel * .02, -.25, .25) };
  const center = new THREE.Vector3();
  let rear = Infinity, front = -Infinity;
  people.forEach(pp => {
    const root = pp.root;
    const tJump = .3 + pp.order * .17, jumpDur = .6;
    if (st.phase === 'drive' || (st.phase === 'disembark' && disT < tJump)) {
      if (root.parent !== rig.body) rig.body.add(root);
      root.position.copy(pp.bed); root.rotation.set(0, pp.bedYaw, 0);
      poseRide(pp, t, truckState.shake, { x: sway.x * (1 + pp.rnd * .5), z: sway.z * (1 + pp.rnd * .5) }, st.phase === 'disembark');
      pp.trek = null;
    } else {
      if (root.parent !== scene) scene.add(root);
      const want = trekTarget(pp, sLead, t, st.phase !== 'walk' || stopped);
      if (st.phase === 'disembark') {
        // hop over the side of the bed, land beside the pickup, then stroll to their group
        const from = pp.bed.clone().applyMatrix4(rig.body.matrixWorld);
        const sd = pp.bed.x < 0 ? -1 : 1;
        const land = new THREE.Vector3(pp.bed.x + sd * 1.25, 0, pp.bed.z).applyMatrix4(rig.truck.matrixWorld);
        land.y = world.heightAt(land.x, land.z);
        const k = (disT - tJump) / jumpDur;
        if (k < 1) {
          root.position.lerpVectors(from, land, k); root.position.y += Math.sin(k * Math.PI) * .55;
          root.rotation.set(0, rig.truck.rotation.y + sd * Math.PI / 2, 0);
          poseJump(pp, k);
        } else {
          const tp = trailPoint(want.s, want.lat).p;
          const dur = Math.max(.5, CONFIG.disembark - tJump - jumpDur - .4) * pp.pace;
          const q = THREE.MathUtils.clamp((disT - tJump - jumpDur - .15) / dur, 0, 1), qe = q * q * (3 - 2 * q);
          root.position.lerpVectors(land, tp, qe); root.position.y = world.heightAt(root.position.x, root.position.z);
          if (q > 0 && q < 1) {
            const d = tp.clone().sub(land);
            root.rotation.set(0, Math.atan2(d.x, d.z), 0);
            pp.cyc += simDt * (d.length() / dur) * 1.5 / pp.stride * Math.PI; poseWalk(pp, pp.cyc, 1);
          } else { root.rotation.set(0, q >= 1 ? root.rotation.y : rig.truck.rotation.y + sd * Math.PI / 2, 0); poseIdle(pp, t, 'none'); }
          pp.trek = { s: want.s, lat: want.lat, v: 0 };
        }
      } else {
        // walk sim: everyone chases their own target at their own pace → gaps open and close naturally
        if (!pp.trek || simDt === 0 || Math.abs(pp.trek.s - want.s) > 80) pp.trek = { s: want.s, lat: want.lat, v: 0 };
        const tr = pp.trek, maxV = CONFIG.walkSpeed * 1.25 * pp.pace;
        const vWant = THREE.MathUtils.clamp((want.s - tr.s) * 1.2, 0, maxV);
        tr.v += (vWant - tr.v) * Math.min(1, simDt * 3);
        tr.s += tr.v * simDt;
        tr.lat += (want.lat - tr.lat) * Math.min(1, simDt * 1.2);
        const { p, dir } = trailPoint(tr.s, tr.lat);
        root.position.copy(p);
        if (tr.v > .6) {
          root.rotation.set(0, Math.atan2(dir.x, dir.z), 0);
          pp.cyc += simDt * tr.v / pp.stride * Math.PI;
          poseWalk(pp, pp.cyc, Math.min(1, tr.v / 2.5));
        } else {
          const mode = st.mode === 'memory' ? 'photo' : st.mode === 'end' || st.mode === 'finale' ? 'cheer' : 'none';
          let yaw = Math.atan2(dir.x, dir.z);
          if (mode !== 'none') { const f = world.fallsFocus.clone().sub(p); yaw = Math.atan2(f.x, f.z); }
          else if (pp.cluster.couple || pp.cluster.n > 2) yaw += (pp.lat > 0 ? -1 : 1) * (.9 + pp.jit * .4);  // turn to chat with their group
          root.rotation.set(0, yaw, 0);
          poseIdle(pp, t, mode);
        }
      }
    }
    root.getWorldPosition(tmpV); center.add(tmpV);
    const ps = pp.trek ? pp.trek.s : sTruck;
    rear = Math.min(rear, ps); front = Math.max(front, ps);
  });
  return { center: center.divideScalar(people.length), rear, front };
}

// ---------------------------------------------------------------------------------------------
// Camera director — kept low and on the trail corridor so the forest never swallows the shot.
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
const bump = (x, c, w) => Math.exp(-(((x - c) / w) ** 2));
const ease = k => k < .5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
const lerpN = (a, b, k) => a + (b - a) * k;

function cameraTarget(st, crew) {
  const R = world.route, { dir } = R.at(st.s);
  const side = new THREE.Vector3(-dir.z, 0, dir.x);
  const pos = new THREE.Vector3(), look = new THREE.Vector3();
  const truckP = rig.truck.position;
  const sMid = (crew.rear + crew.front) / 2;
  switch (st.mode) {
    case 'intro': {
      const k = ease(Math.min(1, st.h / st.g.dur));
      const H = world.homeCenter, a = R.at(0), as = new THREE.Vector3(-a.dir.z, 0, a.dir.x);
      const p0 = H.clone().addScaledVector(a.dir, 30).addScaledVector(as, -30).addScaledVector(UP, 26);
      const p1 = a.p.clone().addScaledVector(a.dir, -8).addScaledVector(as, 1.4).addScaledVector(UP, 3.2);
      pos.lerpVectors(p0, p1, k);
      look.lerpVectors(H.clone().addScaledVector(UP, 3), R.at(8).p.addScaledVector(UP, 1.8), k);
      break;
    }
    case 'hold': {
      if (st.phase === 'drive') { // slow push along the road beside the stopped pickup
        pos.copy(R.at(st.s - 7 + st.h * .5).p).addScaledVector(side, 1.6 - st.h * .25).addScaledVector(UP, 2.9);
        look.copy(truckP).addScaledVector(UP, 2.2);
      } else { // from the back of the group, low, looking up the trail at everyone
        pos.copy(R.at(crew.rear - 6 + st.h * .4).p).addScaledVector(side, .8).addScaledVector(UP, 2.3);
        look.copy(R.at(sMid + 2).p).addScaledVector(UP, 1.9);
      }
      break;
    }
    case 'gamesIntro': { // back at the stay: over the hut roof, gliding down to the ground beside it
      const k = ease(Math.min(1, st.h / st.g.dur)), G = games.G, Hm = world.homeCenter;
      const p0 = Hm.clone().addScaledVector(games.V, 26).addScaledVector(games.U, 10).addScaledVector(UP, 30);
      const p1 = games.P(22, 16, 7);
      pos.lerpVectors(p0, p1, k);
      look.lerpVectors(Hm.clone().addScaledVector(UP, 2), games.P(-1, 0, 1), k);
      break;
    }
    case 'cricket': { // from behind the bowler's arm, slowly drifting round to square
      const k = Math.min(1, st.h / st.g.dur);
      pos.copy(games.P(22 - 8 * k, 16 - 2 * k, 7 - 1.5 * k));
      look.copy(games.P(-1 - 2 * k, 0, 1));
      break;
    }
    case 'lagori': { // slow orbit around the seven stones
      const S0 = games.stack, a = -.5 + st.h * .05, r = 13;
      pos.copy(S0).addScaledVector(games.V, Math.cos(a) * r).addScaledVector(games.U, Math.sin(a) * r).addScaledVector(UP, 5);
      look.copy(S0).addScaledVector(UP, .6);
      break;
    }
    case 'campfire': { // low, slow orbit round the fire ring, the stay's lit windows behind
      const F = camp.fire, a = 2.2 + st.h * .07, r = 9.5 - Math.min(1, st.h / st.g.dur) * 2;
      pos.copy(F).addScaledVector(games.V, Math.cos(a) * r).addScaledVector(games.U, Math.sin(a) * r).addScaledVector(UP, 2.4);
      look.copy(F).addScaledVector(UP, .9);
      break;
    }
    case 'stargaze': { // from just behind the chairs, tilting up from the fire into the Milky Way
      const F = camp.fire, k = ease(Math.min(1, st.h / st.g.dur));
      pos.copy(F).addScaledVector(games.V, 7.6 + .6 * k).addScaledVector(games.U, .8).addScaledVector(UP, 1.7 - .5 * k);
      look.copy(F).addScaledVector(games.V, lerpN(-2, -14, k)).addScaledVector(UP, lerpN(1, 21, k));
      break;
    }
    case 'disembark': { // from the road ahead, watching everyone hop off and walk towards camera
      const k = ease(Math.min(1, st.h / CONFIG.disembark));
      pos.copy(R.at(sTruck + 30 - 4 * k).p).addScaledVector(side, -.6).addScaledVector(UP, 2.3);
      look.copy(truckP).addScaledVector(dir, 6 * k).addScaledVector(UP, 1.4);
      break;
    }
    case 'memory': {
      const toFalls = world.fallsFocus.clone().sub(crew.center).setY(0).normalize();
      pos.copy(R.at(crew.rear - 5).p).addScaledVector(UP, 2.6);
      look.copy(crew.center).addScaledVector(toFalls, 60).addScaledVector(UP, 4);
      break;
    }
    case 'finale': case 'end': { // on the pool shore: the group in front of the waterfall
      const F = world.fallsFocus, P = world.poolCenter;
      const k = st.mode === 'end' ? 1 : ease(Math.min(1, st.h / CONFIG.finaleHold));
      pos.copy(P).add(new THREE.Vector3(-36 + 8 * k, 2.6 + k, 13 - 4 * k));
      pos.y = Math.max(pos.y, world.heightAt(pos.x, pos.z) + 2.2);
      if (st.mode === 'end') pos.y += st.h * 1.2;
      look.copy(F).addScaledVector(UP, -3 + (st.mode === 'end' ? st.h * .6 : 0));
      break;
    }
    default: {
      if (st.phase === 'drive') { // low chase cam behind the pickup, looking over the people in the bed
        pos.copy(R.at(st.s - 8).p).addScaledVector(dir, -Math.max(0, 8 - st.s)).addScaledVector(side, 1.3).addScaledVector(UP, 3.2);
        look.copy(R.at(st.s + 8).p).addScaledVector(UP, 1.9);
      } else { // just behind the last walkers; gentle rise for the valley crossing
        const aer = bump(crew.rear, S(MARK.crossing), 70);
        pos.copy(R.at(crew.rear - 6 - 6 * aer).p).addScaledVector(side, .7).addScaledVector(UP, 2.4 + 9 * aer);
        look.copy(R.at(crew.rear + 12 + 8 * aer).p).addScaledVector(UP, 1.5);
      }
    }
  }
  return { pos, look };
}

// ---------------------------------------------------------------------------------------------
// Hologram projector anchor + glowing guide line ahead on the trail
function buildTrekker() {
  orb = new THREE.Object3D(); // invisible anchor the hologram projects from
  scene.add(orb);

  holoCone = new THREE.Mesh(new THREE.CylinderGeometry(1.9, .1, 4, 32, 1, true).translate(0, 2, 0), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uOn: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: `uniform float uTime, uOn; varying vec2 vUv;
      void main(){ float lines = .55 + .45 * step(.5, fract(vUv.y * 18. - uTime * 1.5));
        float a = (1. - vUv.y) * .35 * lines * uOn; gl_FragColor = vec4(vec3(.45, 1., .95) * a, a); }`,
  }));
  scene.add(holoCone);

  const R = world.route, pos = [], sAttr = [], xAttr = [], idx = [];
  R.pts.forEach((p, i) => {
    const a = R.pts[Math.max(0, i - 2)], b = R.pts[Math.min(R.len, i + 2)], l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const nx = -(b.z - a.z) / l, nz = (b.x - a.x) / l;
    for (const s of [-1, 1]) {
      const x = p.x + nx * .2 * s, z = p.z + nz * .2 * s;
      pos.push(x, Math.max(p.y, world.heightAt(x, z)) + .14, z); sAttr.push(i); xAttr.push(s);
    }
    if (i) { const k = (i - 1) * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aS', new THREE.Float32BufferAttribute(sAttr, 1));
  g.setAttribute('aX', new THREE.Float32BufferAttribute(xAttr, 1));
  g.setIndex(idx);
  guide = new THREE.Mesh(g, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uProg: { value: 0 }, uTime: { value: 0 } },
    vertexShader: 'attribute float aS; attribute float aX; varying float vS; varying float vX; void main(){ vS = aS; vX = aX; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: `uniform float uProg, uTime; varying float vS; varying float vX;
      void main(){ float d = vS - uProg; if (d < 0.) discard;
        float a = (1. - smoothstep(10., 120., d)) * smoothstep(0., 2., d);
        a *= .45 + .55 * step(.45, fract((vS - uTime * 7.) / 5.));
        a *= 1. - abs(vX) * .7;
        gl_FragColor = vec4(vec3(.72, 1., .52) * a, a); }`,
  }));
  scene.add(guide);
}

// ---------------------------------------------------------------------------------------------
// HUD
const CHAPTERS = { 1: 'THE STAY & TEA ESTATE', 2: 'GAMES & CAMPFIRE NIGHT', 3: 'TO THE TREKKING POINT' };
function chapterFor(st) {
  const g = st.g, L = world.route.len;
  if (g.loc) return g.loc;
  if (st.mode === 'intro') return { name: 'THE HUT', sub: 'MALNAD HOMESTAY · BASE CAMP', next: 'KELAGUR TEA ESTATE' };
  if (g.ch === 1) return g.loc === 'tea'
    ? { name: 'KELAGUR TEA ESTATE', sub: 'CHAPTER 1 COMPLETE', next: 'BACK TO THE STAY' }
    : { name: 'JEEP RIDE', sub: 'SELFIE STOP · COFFEE & ARECA ESTATES', next: 'KELAGUR TEA ESTATE' };
  if (st.mode === 'gamesIntro') return { name: 'BACK AT THE STAY', sub: 'THE GROUND BESIDE THE HUT', next: 'CRICKET' };
  if (st.mode === 'cricket') return { name: 'CRICKET', sub: 'THE GROUND · HOMESTAY', next: 'LAGORI' };
  if (st.mode === 'lagori') return { name: 'LAGORI', sub: 'SEVEN STONES · THE GROUND', next: 'JUNGLE CHECKPOINT' };
  if (st.phase === 'drive') return st.s < S(MARK.teaEnd) - 60
    ? { name: 'KELAGUR TEA ESTATE', sub: 'BACK IN THE JEEP · FLORA & FAUNA SCAN', next: 'JUNGLE CHECKPOINT' }
    : { name: 'JUNGLE ROAD', sub: 'HEADING FOR THE CHECKPOINT', next: 'TREK CHECKPOINT' };
  if (st.phase === 'disembark') return { name: 'CHECKPOINT', sub: 'EVERYONE GETS DOWN · TREK BEGINS', next: 'EVERGREEN FOREST' };
  if (st.mode === 'memory' && st.g.memory?.stage !== 'trek') return { name: 'MEMORIES', sub: 'KELAGUR TEA ESTATE', next: 'EVERGREEN FOREST' };
  if (st.s >= L - 40) return { name: 'BANDAJE FALLS', sub: 'DURGADAHALLI · DESTINATION REACHED', next: 'EXPEDITION COMPLETE' };
  if (st.s >= S(MARK.climbStart) + 25) return { name: 'RANI JHARI RIDGE', sub: 'THE CLIMB · CLOUD VIEWPOINTS', next: 'BANDAJE FALLS' };
  if (st.s >= S(MARK.crossing) - 45) return { name: 'NETRAVATHI STREAM', sub: 'VALLEY CROSSING', next: 'RANI JHARI RIDGE' };
  return { name: 'EVERGREEN FOREST', sub: 'WESTERN GHATS · DESCENT', next: 'NETRAVATHI STREAM' };
}

// Stylised readout anchored on Kelagur (13°09.9'N 75°27.4'E); scene metres are stretched ×11 to
// stand in for the real ~7 km between Kelagur and Bandaje falls.
function coords(p) {
  const H = world.homeCenter, k = 11;
  const lat = 13.165 - (p.z - H.z) * k / 111000, lon = 75.457 + (p.x - H.x) * k / 108100;
  const dm = v => `${Math.floor(v)}°${((v % 1) * 60).toFixed(2).padStart(5, '0')}'`;
  return `${dm(lat)} N  ${dm(lon)} E`;
}

let chapterKey = '', locKey = '', chapterTimer;
function updateHud(st, focus) {
  const ch = chapterFor(st);
  if (ch.name !== locKey) {
    locKey = ch.name;
    $('locationName').textContent = ch.name; $('locationSub').textContent = ch.sub; $('nextWaypoint').textContent = ch.next;
    $('locationTag').classList.remove('glitch'); void $('locationTag').offsetWidth; $('locationTag').classList.add('glitch');
  }
  if (st.g.ch !== chapterKey && (st.t >= CONFIG.logoIntro || params.has('freeze'))) { // small chapter label, once per chapter, after the logo
    chapterKey = st.g.ch;
    $('chapterNo').textContent = `CHAPTER ${String(st.g.ch).padStart(2, '0')}`; $('chapterName').textContent = CHAPTERS[st.g.ch];
    const c = $('chapter'); c.classList.remove('on'); void c.offsetWidth; c.classList.add('on');
    clearTimeout(chapterTimer); chapterTimer = setTimeout(() => c.classList.remove('on'), 3200);
  }
  const walking = st.phase === 'walk' && st.g.ch === 3;
  const k = walking ? THREE.MathUtils.clamp((st.s - sWalk) / (world.route.len - sWalk), 0, 1) : 0;
  $('progressLabel').textContent = walking ? 'TREK PROGRESS' : st.phase === 'games' ? (st.g.night ? 'CHAPTER 2 · CAMPFIRE NIGHT' : 'CHAPTER 2 · GAMES AT THE STAY') : st.phase === 'drive' ? (st.g.ch === 1 ? 'CHAPTER 1 · JEEP TO THE TEA ESTATE' : 'CHAPTER 3 · JEEP TO THE TREKKING POINT') : 'TREK STARTING';
  $('progressPct').textContent = String(Math.round(k * 100)).padStart(2, '0') + '%';
  $('progressFill').style.width = (k * 100) + '%';
  $('distance').textContent = `${(k * CONFIG.trekKm).toFixed(1)} / ${CONFIG.trekKm} KM`;
  $('elevation').textContent = Math.round(CONFIG.elevBase + focus.y * CONFIG.elevScale).toLocaleString() + ' M';
  $('coordinates').textContent = coords(focus);
  $('finale').classList.toggle('on', st.mode === 'end');
  $('logoIntro').classList.toggle('on', st.t < CONFIG.logoIntro && !params.has('freeze'));
}

// ---------------------------------------------------------------------------------------------
let clock = 0, last = 0, paused = false, snap = false, holoKey = -1, fading = false;
const freeze = params.has('freeze');
const debugCam = params.get('cam')?.split(',').map(Number); // ?cam=x,y,z,lookX,lookY,lookZ
const v = new THREE.Vector3();

function restart() { clock = 0; snap = true; holoKey = -1; chapterKey = ''; locKey = ''; hideHolo(true); sound?.restart(); }
let lastSeg = -1;

function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(.05, (now - last) / 1000 || 0); last = now;
  if (!paused && !freeze) clock += dt;
  if (clock >= timeline.total && !fading) {
    fading = true; $('fade').classList.add('on');
    setTimeout(() => { restart(); $('fade').classList.remove('on'); fading = false; }, 900);
  }
  const t = Math.min(clock, timeline.total - .001), st = stateAt(t), secs = now / 1000;

  // hard cuts between places (dip to black) — the camera jumps with them
  const cut = timeline.cuts.reduce((a, tc) => Math.max(a, 1 - Math.abs(t - tc) / .32), 0);
  $('cut').style.opacity = cut.toFixed(3);
  if (st.i !== lastSeg) { if (st.g.cut) snap = true; lastSeg = st.i; }
  sTruck = st.g.park; sWalk = st.g.ws;
  const simDt = freeze || paused ? 0 : dt;
  const ts = placeTruck(st, secs, simDt);
  const crew = updateCrew(st, secs, simDt, ts, freeze ? 0 : simDt || 1e-4);
  const focus = st.phase === 'drive' ? rig.truck.position : crew.center;
  const rate = st.phase === 'drive' && st.g.type === 'move' ? 5 : st.phase === 'walk' && st.g.type === 'move' ? 3.5 : 2.4;

  const { pos, look } = cameraTarget(st, crew);
  const k = snap || freeze ? 1 : 1 - Math.exp(-dt * rate);
  camPos.lerp(pos, k); camLook.lerp(look, k); snap = false;
  camPos.y = Math.max(camPos.y, world.heightAt(camPos.x, camPos.z) + 1.7);
  camera.position.copy(camPos); camera.lookAt(camLook);
  if (debugCam) { camera.position.set(debugCam[0], debugCam[1], debugCam[2]); camera.lookAt(debugCam[3], debugCam[4], debugCam[5]); }

  // the hologram projects from just above the pickup / the middle of the group
  orb.position.copy(st.phase === 'drive' ? rig.truck.position : crew.center).addScaledVector(UP, st.phase === 'drive' ? 3.6 : st.phase === 'games' ? 4 : 2.6);
  guide.material.uniforms.uProg.value = st.phase === 'drive' ? st.s + 3 : st.phase === 'walk' ? crew.front + 2 : st.phase === 'games' ? 1e6 : sTruck + 3;
  guide.material.uniforms.uTime.value = secs;

  // holograms: timed cues (photos / videos / flora groups)
  const want = timeline.cues.findIndex(c => t >= c.t0 && t < c.t1 - .45);
  if (want !== holoKey) {
    holoKey = want;
    const c = timeline.cues[want];
    if (want < 0) hideHolo();
    else showHolo(c.items, c.total, !!c.big, c.t1 - c.t0, c.layout);
  }
  holoCone.position.copy(orb.position);
  const cu = holoCone.material.uniforms; cu.uTime.value = secs;
  cu.uOn.value += ((holoKey >= 0 ? 1 : 0) - cu.uOn.value) * Math.min(1, dt * 6);
  v.copy(orb.position).project(camera);
  placeBeam((v.x * .5 + .5) * game.clientWidth, (-v.y * .5 + .5) * game.clientHeight, holoKey >= 0 && v.z < 1);

  world.setNight(!!st.g.night);
  world.update(secs, dt, focus);
  // music follows the story: gentle at the homestay, groove on the road and trail, swell at the falls
  const w = world.waterAt(camera.position);
  sound.set({
    intensity: st.mode === 'intro' ? .18 : st.g.night ? .22 : st.phase === 'games' ? .7 : st.mode === 'finale' ? 1 : st.mode === 'end' ? .55 : st.mode === 'memory' || st.mode === 'disembark' ? .42
      : st.phase === 'drive' ? (st.g.type === 'move' ? .6 : .38) : st.g.type === 'move' ? .85 : .45,
    engine: st.phase === 'drive' || (st.phase === 'disembark' && st.h < 1.5) ? 1 : 0,
    speed: Math.min(1, Math.abs(truckVel) / CONFIG.driveSpeed),
    water: w.stream, falls: w.falls, birds: st.g.night ? .05 : st.mode === 'finale' || st.mode === 'end' ? .25 : .8,
  });
  updateHud(st, focus);
  composer.render();
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen?.(); else document.documentElement.requestFullscreen?.().catch(() => {});
}

function resize() {
  const w = game.clientWidth, h = game.clientHeight;
  camera.aspect = w / h; camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(w, h);
}

init().catch(err => { console.error(err); status('ERROR — ' + err.message); });
