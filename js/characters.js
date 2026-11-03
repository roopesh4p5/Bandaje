// Cel-shaded (anime style) trekkers: jointed bodies with shaped torsos, hair styles, specs,
// backpacks, caps / bucket hats — posed procedurally for riding, jumping, walking and idling.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mulberry32 } from './noise.js';

// ---- toon shading + inverted-hull outlines ----
const ramp = (() => {
  const t = new THREE.DataTexture(new Uint8Array([125, 125, 125, 255, 200, 200, 200, 255, 255, 255, 255, 255]), 3, 1);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t;
})();
const mats = new Map();
export function toon(color) {
  const k = typeof color === 'number' ? color : new THREE.Color(color).getHex();
  if (!mats.has(k)) mats.set(k, new THREE.MeshToonMaterial({ color: k, gradientMap: ramp }));
  return mats.get(k);
}
const outlineMat = new THREE.MeshBasicMaterial({ color: 0x15100c, side: THREE.BackSide });
outlineMat.onBeforeCompile = sh => {
  sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normalize(normal) * 0.016;');
};
outlineMat.customProgramCacheKey = () => 'outline';

export function part(geo, color, parent, { outline = true, shadow = true } = {}) {
  const m = new THREE.Mesh(geo, toon(color));
  m.castShadow = shadow;
  if (outline) { const o = new THREE.Mesh(geo, outlineMat); m.add(o); }
  parent.add(m);
  return m;
}

const cap = (r, len) => new THREE.CapsuleGeometry(r, len, 4, 10);
const lathe = (pts, seg = 14) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);

const SKIN = ['#8d5a3b', '#a8714b', '#c48a5e', '#6e4329', '#b97c55', '#d19c74'];
const SHIRT = ['#e04a3a', '#f2c230', '#1f9e8f', '#283c78', '#f4f1ea', '#f07c2a', '#6b7a35', '#c43b6e', '#3a8fd8', '#2b2b2b', '#8a4fc0', '#e8e04e'];
const PANTS = ['#2e4a78', '#1d1f24', '#8b7a55', '#5a5f66', '#3b4a2f', '#24324f'];
const HAIR = ['#14100d', '#22170f', '#2c1d14', '#0d0b0a'];
const BAG = ['#d8492d', '#2f6e3f', '#1f2f5a', '#f0a020', '#444a50', '#7a2f8f'];

export function makePerson(seed) {
  const r = mulberry32(seed * 977 + 13);
  const pick = a => a[Math.floor(r() * a.length)];
  const skin = pick(SKIN), shirt = pick(SHIRT), pants = pick(PANTS), hairC = pick(HAIR);
  const female = r() < .45, shorts = r() < .2, jacket = r() < .25;
  const root = new THREE.Group();
  const hips = new THREE.Group(); hips.position.y = .95; root.add(hips);
  part(lathe([[.0, -.1], [.13, -.09], [.155, 0], [.145, .08], [0, .1]]).scale(1, 1, .7), pants, hips);
  const spine = new THREE.Group(); spine.position.y = .06; hips.add(spine);
  const w = female ? .92 : 1;
  const torso = part(lathe([[0, 0], [.135 * w, .02], [.128 * w, .16], [.16 * w, .32], [.18 * w, .46], [.15, .53], [.06, .58], [0, .59]]), jacket ? pick(['#3a4a5a', '#7a3a2a', '#2a4a3a']) : shirt, spine);
  torso.scale.z = .66;

  // head
  const neck = new THREE.Group(); neck.position.y = .57; spine.add(neck);
  part(cap(.045, .06), skin, neck).position.y = .03;
  const head = new THREE.Group(); head.position.y = .1; neck.add(head);
  const skull = part(new THREE.SphereGeometry(.115, 18, 14), skin, head); skull.scale.set(.92, 1.06, 1); skull.position.y = .1;
  for (const s of [-1, 1]) { // big anime eyes + brows
    const eye = new THREE.Mesh(new THREE.SphereGeometry(.022, 10, 8), toon('#16110e')); eye.scale.set(.75, 1.15, .4); eye.position.set(s * .042, .1, .1); head.add(eye);
    const hl = new THREE.Mesh(new THREE.SphereGeometry(.007, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffffff })); hl.position.set(s * .042 + .006, .112, .108); head.add(hl);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(.034, .007, .01), toon(hairC)); brow.position.set(s * .044, .142, .103); brow.rotation.z = s * -.12; head.add(brow);
  }
  // hair
  const hairCap = part(new THREE.SphereGeometry(.123, 18, 12, 0, Math.PI * 2, 0, Math.PI * .55), hairC, head);
  hairCap.position.set(0, .115, -.008); hairCap.rotation.x = -.25; hairCap.scale.set(.96, 1.05, 1.05);
  const fringe = part(new THREE.SphereGeometry(.12, 14, 8, -1.2, 2.4, .6, .55), hairC, head, { outline: false });
  fringe.position.set(0, .105, .005); fringe.rotation.y = 0;
  const style = female ? pick(['long', 'pony', 'bun']) : pick(['short', 'short', 'spiky']);
  if (style === 'long') { const L = part(lathe([[.11, 0], [.12, -.12], [.1, -.24], [0, -.26]], 12), hairC, head); L.position.set(0, .12, -.035); L.scale.z = .7; }
  if (style === 'pony') { const p = part(cap(.04, .14), hairC, head); p.position.set(0, .03, -.13); p.rotation.x = .5; }
  if (style === 'bun') part(new THREE.SphereGeometry(.05, 10, 8), hairC, head).position.set(0, .22, -.08);
  if (style === 'spiky') for (let i = 0; i < 6; i++) { const s = part(new THREE.ConeGeometry(.03, .08, 5), hairC, head, { outline: false }); s.position.set((i - 2.5) * .03, .215, .02 - Math.abs(i - 2.5) * .01); s.rotation.x = -.5; }

  const acc = { specs: r() < .35, bag: r() < .65, hat: r() < .4 ? pick(['cap', 'bucket', 'cap']) : null };
  if (acc.specs) {
    const frame = toon('#121212');
    for (const s of [-1, 1]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(.026, .004, 6, 16), frame); ring.position.set(s * .043, .1, .118); head.add(ring); }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(.03, .004, .004), frame); bar.position.set(0, .104, .12); head.add(bar);
    for (const s of [-1, 1]) { const arm = new THREE.Mesh(new THREE.BoxGeometry(.004, .004, .11), frame); arm.position.set(s * .07, .104, .065); head.add(arm); }
  }
  if (acc.hat === 'cap') {
    const hc = pick(['#c0392b', '#1f3a68', '#f2f2f2', '#2d5a27', '#e2a32d']);
    const crown = part(new THREE.SphereGeometry(.128, 16, 10, 0, Math.PI * 2, 0, Math.PI * .5), hc, head); crown.position.y = .13;
    const visor = part(new THREE.CylinderGeometry(.09, .09, .012, 16, 1, false, -Math.PI / 2, Math.PI), hc, head); visor.position.set(0, .14, .09); visor.rotation.x = .12;
  } else if (acc.hat === 'bucket') {
    const hc = pick(['#c8b88a', '#5a6b3a', '#e8e0d0']);
    const b = part(lathe([[0, .1], [.11, .1], [.125, 0], [.2, -.035], [.19, -.045], [0, -.02]], 18), hc, head); b.position.y = .18;
  }

  // arms
  const arms = [-1, 1].map(s => {
    const sh = new THREE.Group(); sh.position.set(s * .2, .47, 0); spine.add(sh);
    part(cap(.048, .2), jacket ? torso.material.color.getHex() : shirt, sh).position.y = -.13;
    const el = new THREE.Group(); el.position.y = -.27; sh.add(el);
    part(cap(.04, .19), jacket ? torso.material.color.getHex() : skin, el).position.y = -.12;
    part(new THREE.SphereGeometry(.045, 10, 8), skin, el).position.y = -.26;
    sh.rotation.z = s * .08;
    return { sh, el };
  });
  // legs
  const legs = [-1, 1].map(s => {
    const hp = new THREE.Group(); hp.position.set(s * .085, -.02, 0); hips.add(hp);
    part(cap(.068, .3), pants, hp).position.y = -.21;
    const kn = new THREE.Group(); kn.position.y = -.43; hp.add(kn);
    part(cap(.052, .3), shorts ? skin : pants, kn).position.y = -.21;
    const ft = new THREE.Group(); ft.position.y = -.46; kn.add(ft);
    part(new RoundedBoxGeometry(.1, .075, .24, 2, .03), pick(['#f2f2f2', '#2a2a2a', '#c0392b', '#3a6ea5', '#8a6a4a']), ft).position.set(0, -.005, .045);
    return { hp, kn };
  });
  if (acc.bag) {
    const bc = pick(BAG);
    const bag = part(new RoundedBoxGeometry(.3, .38, .17, 3, .05), bc, spine); bag.position.set(0, .3, -.17);
    part(new RoundedBoxGeometry(.22, .14, .07, 2, .025), bc, bag).position.set(0, -.07, -.1);
    for (const s of [-1, 1]) { const st = new THREE.Mesh(new THREE.BoxGeometry(.035, .4, .02), toon('#202020')); st.position.set(s * .1, .3, .11); st.rotation.x = -.08; spine.add(st); }
    if (r() < .5) { const bt = part(cap(.03, .1), '#5ec8e8', bag); bt.position.set(.17, -.05, 0); }
  }
  const phone = new THREE.Mesh(new THREE.BoxGeometry(.07, .13, .012), toon('#111111'));
  phone.position.set(0, -.3, .03); phone.visible = false; arms[1].el.add(phone);

  root.scale.setScalar((female ? .9 : .97) + r() * .08);
  return { root, hips, spine, neck, arms, legs, phone, ph: r() * 6.28, rnd: r(), jit: r() - .5, stride: 1.45 + r() * .4, acc,
    armPoses: [ARM_POSES[Math.floor(r() * ARM_POSES.length)], ARM_POSES[Math.floor(r() * ARM_POSES.length)]] };
}

// ---- poses ----
const lerp = THREE.MathUtils.lerp;
// Arm gestures for riders. Each person gets their own pick per arm (see armPoses on the person).
export const ARM_POSES = ['rail', 'rail', 'wave', 'selfie', 'point', 'hips', 'crossed', 'shoulder', 'pocket', 'up'];
function rideArm(p, a, s, pose, t, k) {
  const j = p.jit; // personal variation so no two people hold an arm the same way
  switch (pose) {
    case 'rail': a.sh.rotation.set(-.2 + j * .3, 0, s * (1.05 + j * .25)); a.el.rotation.set(-.5 - j * .3, 0, 0); break;
    case 'wave': a.sh.rotation.set(-.3, 0, s * (2.5 + Math.sin(t * (5 + j * 3) + k) * .3)); a.el.rotation.set(-.2 + Math.sin(t * 6 + k) * .3, 0, 0); break;
    case 'up': a.sh.rotation.set(-.4, 0, s * 2.85); a.el.rotation.set(-.1, 0, 0); break;
    case 'selfie': a.sh.rotation.set(-2.1 - j * .2, 0, s * .45); a.el.rotation.set(-.35, 0, 0); p.phone.visible = s > 0; break;
    case 'point': a.sh.rotation.set(-1.45 + j * .3, 0, s * (.7 + j * .3)); a.el.rotation.set(-.05, 0, 0); break;
    case 'hips': a.sh.rotation.set(.1, 0, s * .55); a.el.rotation.set(-.3, 0, -s * 1.5); break;
    case 'crossed': a.sh.rotation.set(-.55, 0, -s * .15); a.el.rotation.set(-1.85, 0, 0); break;
    case 'shoulder': a.sh.rotation.set(-1.15, 0, s * -.15 + s * j * .3); a.el.rotation.set(-.35, 0, 0); break;
    default: a.sh.rotation.set(.05 + j * .1, 0, s * .1); a.el.rotation.set(-.2, 0, 0);
  }
}

export function poseRide(p, t, shake, sway, holdRails) {
  // standing in the truck bed: knees soft, body lagging the truck, each with their own gestures
  const k = p.ph;
  p.hips.position.y = .93 + shake * .025 * Math.sin(t * 30 + k);
  p.hips.rotation.y = 0;
  p.spine.rotation.x = sway.x + Math.sin(t * 2.1 + k) * .04;
  p.spine.rotation.z = sway.z + Math.sin(t * 1.7 + k) * .04;
  p.spine.rotation.y = p.jit * .4;
  p.neck.rotation.y = Math.sin(t * (.4 + p.rnd * .5) + k * 3) * .7;
  p.neck.rotation.x = -.05 + Math.sin(t * 1.3 + k) * .06;
  p.legs.forEach((l, i) => { l.hp.rotation.x = -.12 + (i ? p.jit : -p.jit) * .15; l.kn.rotation.x = .22 + shake * .1 * Math.sin(t * 25 + k + i); l.hp.rotation.z = (i ? -1 : 1) * -.08; });
  p.phone.visible = false;
  p.arms.forEach((a, i) => rideArm(p, a, i ? 1 : -1, holdRails ? 'rail' : p.armPoses[i], t, k + i));
}

export function poseWalk(p, cyc, amt = 1) {
  const s = Math.sin(cyc), c = Math.cos(cyc);
  p.hips.position.y = .95 - .035 * amt + Math.abs(c) * .035 * amt;
  p.hips.rotation.y = s * .12 * amt;
  p.spine.rotation.set(.08 * amt, -s * .2 * amt, 0);
  p.neck.rotation.set(-.05, s * .1 * amt, 0);
  p.legs.forEach((l, i) => {
    const q = i ? -s : s;
    l.hp.rotation.set(-q * .55 * amt, 0, 0);
    l.kn.rotation.x = Math.max(0, (i ? c : -c)) * .9 * amt + .06;
  });
  p.arms.forEach((a, i) => {
    const q = i ? s : -s;
    a.sh.rotation.set(-q * .5 * amt + .05, 0, (i ? 1 : -1) * .1);
    a.el.rotation.set(-.35 - Math.max(0, -q) * .4 * amt, 0, 0);
  });
}

export function poseIdle(p, t, mode) {
  const k = p.ph;
  p.hips.position.y = .95 + Math.sin(t * 1.8 + k) * .006;
  p.hips.rotation.y = 0;
  p.spine.rotation.set(.02 + Math.sin(t * 1.8 + k) * .015, Math.sin(t * .4 + k) * .15, 0);
  p.neck.rotation.set(-.05, Math.sin(t * .5 + k * 2) * .35, 0);
  p.legs.forEach((l, i) => { l.hp.rotation.set(0, 0, (i ? -1 : 1) * -.06); l.kn.rotation.x = .04; });
  p.arms.forEach((a, i) => { a.sh.rotation.set(0, 0, (i ? 1 : -1) * .14); a.el.rotation.set(-.15, 0, 0); });
  p.phone.visible = false;
  if (mode === 'photo' && p.rnd < .45) { // phone up, taking pictures of the view
    p.arms[1].sh.rotation.set(-1.45, 0, .25); p.arms[1].el.rotation.set(-.55, 0, 0); p.phone.visible = true; p.neck.rotation.set(-.1, 0, 0);
  } else if (mode === 'cheer' && p.rnd < .8) {
    p.arms[0].sh.rotation.set(-.2, 0, -2.7 + Math.sin(t * 7 + k) * .2); p.arms[1].sh.rotation.set(-.2, 0, 2.7 + Math.sin(t * 7 + k + 1) * .2);
    p.arms.forEach(a => a.el.rotation.set(-.25, 0, 0)); p.hips.position.y += Math.max(0, Math.sin(t * 7 + k)) * .05;
  }
}

export function poseJump(p, k) { // k 0..1 through the hop
  const tuck = Math.sin(k * Math.PI);
  p.legs.forEach(l => { l.hp.rotation.x = -.9 * tuck; l.kn.rotation.x = 1.4 * tuck; });
  p.arms.forEach((a, i) => { a.sh.rotation.set(-.6 * tuck, 0, (i ? 1 : -1) * (.3 + 1.2 * tuck)); a.el.rotation.set(-.3, 0, 0); });
  p.spine.rotation.set(.25 * tuck, 0, 0);
  p.hips.position.y = .95 - .1 * tuck;
}
