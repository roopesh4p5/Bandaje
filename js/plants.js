// Procedural plant / rock geometry. Every call with a different seed grows a different shape,
// so the forest is made of many unique trees rather than one repeated cone.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32, noise2 } from './noise.js';

const V3 = THREE.Vector3;
const UP = new V3(0, 1, 0), X = new V3(1, 0, 0);

function limb(a, b, r0, r1, radial = 6) {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r1, r0, len, radial, 1, true);
  g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, b.clone().sub(a).normalize()));
  g.translate(a.x, a.y, a.z);
  const uv = g.attributes.uv;
  const wrap = Math.max(1, Math.round(r0 * 6));
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * wrap, uv.getY(i) * len / 1.5);
  return g;
}

function setColor(g, c) {
  const n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

// A foliage cluster = a few crossed alpha cards textured from the leaf atlas.
function cluster(r, c, size, variant, cards = 3) {
  const out = [], col = new THREE.Color().setHSL(.0, 0, .82 + r() * .3);
  col.offsetHSL((r() - .5) * .04, 0, 0);
  const u0 = (variant % 2) * .5, v0 = .5 - Math.floor(variant / 2) * .5;
  for (let k = 0; k < cards; k++) {
    const g = new THREE.PlaneGeometry(size, size);
    g.applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(r() * Math.PI, r() * Math.PI, r() * Math.PI)));
    g.translate(c.x, c.y, c.z);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * .5, v0 + uv.getY(i) * .5);
    out.push(setColor(g, col));
  }
  return out;
}

// Spherical "crown" normals give soft, volumetric lighting on alpha foliage.
function crownNormals(g, center, lift) {
  const p = g.attributes.position, n = g.attributes.normal, v = new V3();
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i) - center.x, p.getY(i) - center.y + lift, p.getZ(i) - center.z).normalize();
    n.setXYZ(i, v.x, v.y, v.z);
  }
}

function finishLeaves(parts, clusters) {
  const g = mergeGeometries(parts);
  const c = new V3(); clusters.forEach(k => c.add(k.c)); c.divideScalar(Math.max(1, clusters.length));
  let rad = 0; clusters.forEach(k => rad = Math.max(rad, Math.hypot(k.c.x - c.x, k.c.z - c.z)));
  crownNormals(g, c, rad * .5);
  return g;
}

/* Broadleaf evergreen tree, recursive branching. */
export function broadleaf(seed, o) {
  const r = mulberry32(seed);
  const bark = [], clusters = [];
  function grow(a, dir, len, rad, depth) {
    let p = a.clone(); const d = dir.clone();
    const pieces = depth === 0 ? 3 : 2;
    for (let i = 0; i < pieces; i++) {
      d.add(new V3((r() - .5) * .3, (r() - .5) * .1 + o.upBias * .06, (r() - .5) * .3)).normalize();
      const q = p.clone().addScaledVector(d, len / pieces);
      bark.push(limb(p, q, rad * (1 - i / pieces * .3), rad * (1 - (i + 1) / pieces * .3), depth < 2 ? 7 : 5));
      p = q;
    }
    if (depth >= o.depth) { clusters.push({ c: p, s: o.leaf * (.8 + r() * .5) }); return; }
    const n = depth === 0 ? o.branches : 2 + (r() < .45 ? 1 : 0);
    const az0 = r() * 6.283;
    for (let i = 0; i < n; i++) {
      const perp = new V3().crossVectors(d, Math.abs(d.y) < .95 ? UP : X).normalize().applyAxisAngle(d, az0 + i / n * 6.283 + (r() - .5) * .8);
      const nd = d.clone().applyAxisAngle(perp, o.angle * (.7 + r() * .6));
      nd.y += o.upBias * .25; nd.normalize();
      grow(p, nd, len * o.decay * (.8 + r() * .4), rad * .6, depth + 1);
    }
    if (depth >= o.depth - 1) clusters.push({ c: p.clone().addScaledVector(d, -len * .35), s: o.leaf * .85 });
  }
  const trunkDir = new V3((r() - .5) * .12, 1, (r() - .5) * .12).normalize();
  grow(new V3(0, -.3, 0), trunkDir, o.h * o.trunk, o.r, 0);
  if (o.buttress) for (let i = 0; i < 4; i++) {
    const a = i / 4 * 6.283 + r();
    bark.push(limb(new V3(0, o.h * .07, 0), new V3(Math.cos(a) * o.r * 3.2, -.2, Math.sin(a) * o.r * 3.2), o.r * .55, o.r * .12, 5));
  }
  const leafParts = clusters.flatMap(k => cluster(r, k.c, k.s, o.variant + (r() < o.mix ? 1 : 0)));
  return { bark: mergeGeometries(bark), leaves: finishLeaves(leafParts, clusters) };
}

/* Grevillea "silver oak" — the tall shade tree planted through tea estates. */
export function silverOak(seed, o) {
  const r = mulberry32(seed);
  const bark = [], clusters = [];
  const top = new V3((r() - .5) * .8, o.h, (r() - .5) * .8);
  bark.push(limb(new V3(0, -.3, 0), top.clone().multiplyScalar(.5), o.r, o.r * .75, 7));
  bark.push(limb(top.clone().multiplyScalar(.5), top, o.r * .75, o.r * .25, 6));
  clusters.push({ c: top.clone().add(new V3(0, .6, 0)), s: 2.2 });
  for (let i = 0; i < o.n; i++) {
    const t = .35 + .6 * (i / o.n) + (r() - .5) * .05;
    const base = top.clone().multiplyScalar(t), a = r() * 6.283;
    const len = (1 - t) * 6 + 1.2;
    const end = base.clone().add(new V3(Math.cos(a) * len, len * (.4 + r() * .5), Math.sin(a) * len));
    bark.push(limb(base, end, o.r * .25, .03, 4));
    clusters.push({ c: end, s: 1.5 + r() * 1.1 });
    if (r() < .7) clusters.push({ c: base.clone().lerp(end, .55).add(new V3(0, .3, 0)), s: 1.3 + r() * .8 });
  }
  const leafParts = clusters.flatMap(k => cluster(r, k.c, k.s, 3, 2));
  return { bark: mergeGeometries(bark), leaves: finishLeaves(leafParts, clusters) };
}

// Bent strip used for palm fronds, banana leaves and fern fronds (v = along strip).
function frond(r, base, az, o) {
  const seg = 8, pos = [], uv = [], idx = [];
  const dir = new V3(Math.cos(az), 0, Math.sin(az)), side = new V3(-dir.z, 0, dir.x);
  const roll = (r() - .5) * .5;
  for (let i = 0; i <= seg; i++) {
    const t = i / seg, x = t * o.len;
    const y = Math.sin(o.lift) * x - o.droop * x * x / o.len;
    const c = base.clone().addScaledVector(dir, Math.cos(o.lift) * x).add(new V3(0, y, 0));
    const w = o.width * (o.taper ? Math.sin(Math.PI * Math.min(1, t * 1.1 + .05)) * .9 + .1 : 1);
    for (const s of [-1, 1]) {
      const p = c.clone().addScaledVector(side, s * w / 2).add(new V3(0, s * roll * w * .5 - Math.abs(s) * w * o.cup, 0));
      pos.push(p.x, p.y, p.z); uv.push(s < 0 ? 0 : 1, 1 - t);
    }
    if (i < seg) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return setColor(g, new THREE.Color().setHSL(0, 0, .85 + r() * .25));
}

export function palm(seed, o) {
  const r = mulberry32(seed);
  const bark = [], fronds = [];
  const lean = (r() - .5) * o.lean, la = r() * 6.283;
  const at = t => new V3(Math.cos(la) * lean * t * t * o.h, t * o.h, Math.sin(la) * lean * t * t * o.h);
  for (let i = 0; i < 6; i++) bark.push(limb(at(i / 6), at((i + 1) / 6), o.r * (1 - i / 6 * .25), o.r * (1 - (i + 1) / 6 * .25), 7));
  const top = at(1);
  if (o.nuts) for (let i = 0; i < 5; i++) {
    const g = new THREE.SphereGeometry(.16, 7, 5), a = r() * 6.283;
    g.translate(top.x + Math.cos(a) * .3, top.y - .3 - r() * .2, top.z + Math.sin(a) * .3); bark.push(g);
  }
  for (let i = 0; i < o.fronds; i++) {
    fronds.push(frond(r, top, i / o.fronds * 6.283 + r() * .4,
      { len: o.len * (.85 + r() * .3), lift: .3 + r() * .9, droop: o.droop * (.8 + r() * .5), width: o.width, cup: .08, taper: true }));
  }
  return { bark: mergeGeometries(bark), leaves: mergeGeometries(fronds) };
}

export function banana(seed) {
  const r = mulberry32(seed);
  const h = 2 + r() * .8;
  const bark = [limb(new V3(0, 0, 0), new V3(0, h, 0), .17, .12, 7)];
  const leaves = [];
  for (let i = 0; i < 7; i++) leaves.push(frond(r, new V3(0, h - .2, 0), i / 7 * 6.283 + r() * .5,
    { len: 2.2 + r() * .6, lift: .7 + r() * .5, droop: .9, width: .62, cup: .04, taper: false }));
  return { bark: mergeGeometries(bark), leaves: mergeGeometries(leaves) };
}

export function bamboo(seed) {
  const r = mulberry32(seed);
  const bark = [], clusters = [];
  for (let i = 0; i < 16; i++) {
    const a = r() * 6.283, off = new V3(Math.cos(a) * r() * .7, 0, Math.sin(a) * r() * .7);
    const h = 9 + r() * 7, tilt = .1 + r() * .35;
    let p = off.clone(), d = new V3(Math.cos(a) * tilt, 1, Math.sin(a) * tilt).normalize();
    for (let k = 0; k < 5; k++) {
      d.x += Math.cos(a) * .09 * k; d.z += Math.sin(a) * .09 * k; d.normalize();
      const q = p.clone().addScaledVector(d, h / 5);
      bark.push(limb(p, q, .07, .055, 5));
      if (k >= 2) clusters.push({ c: q.clone(), s: 2.2 + r() });
      p = q;
    }
  }
  const leafParts = clusters.flatMap(k => cluster(r, k.c, k.s, 2, 2));
  return { bark: mergeGeometries(bark), leaves: finishLeaves(leafParts, clusters) };
}

export function shrub(seed, variant) {
  const r = mulberry32(seed), clusters = [];
  const n = 5 + Math.floor(r() * 5);
  for (let i = 0; i < n; i++) clusters.push({ c: new V3((r() - .5) * 1.6, .5 + r() * .9, (r() - .5) * 1.6), s: 1.1 + r() * .7 });
  return finishLeaves(clusters.flatMap(k => cluster(r, k.c, k.s, variant, 3)), clusters);
}

export function fern(seed) {
  const r = mulberry32(seed), parts = [];
  const n = 9 + Math.floor(r() * 6);
  for (let i = 0; i < n; i++) parts.push(frond(r, new V3(0, .05, 0), i / n * 6.283 + r() * .4,
    { len: .9 + r() * .7, lift: .8 + r() * .5, droop: 1.1, width: .38, cup: .02, taper: true }));
  return mergeGeometries(parts);
}

export function grassClump(seed, blades = 9) {
  const r = mulberry32(seed), pos = [], col = [], nor = [], idx = [];
  let base = 0;
  for (let b = 0; b < blades; b++) {
    const a = r() * 6.283, rad = Math.sqrt(r()) * .28;
    const ox = Math.cos(a) * rad, oz = Math.sin(a) * rad;
    const h = .35 + r() * .7, w = .035 + r() * .03, bend = .15 + r() * .35, ba = r() * 6.283;
    const bx = Math.cos(ba), bz = Math.sin(ba), sx = -bz, sz = bx;
    const seg = 4;
    for (let i = 0; i <= seg; i++) {
      const t = i / seg, ww = w * (1 - t * .92), off = bend * t * t * h;
      const cx = ox + bx * off, cz = oz + bz * off, cy = h * t;
      const tone = .35 + t * .65;
      for (const s of [-1, 1]) {
        pos.push(cx + sx * ww * s, cy, cz + sz * ww * s);
        col.push(.16 + tone * .3, .26 + tone * .38, .07 + tone * .1);
        nor.push(bx * .3, 1, bz * .3);
      }
      if (i < seg) { const k = base + i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    base += (seg + 1) * 2;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  g.attributes.normal.normalized = false;
  return g;
}

// Polyhedron geometries are non-indexed; weld them so normals come out smooth, not faceted.
function welded(g) { g.deleteAttribute('normal'); g.deleteAttribute('uv'); return mergeVertices(g); }

export function rock(seed, detail = 3) {
  const g = welded(new THREE.IcosahedronGeometry(1, detail)), p = g.attributes.position, v = new V3();
  const s = seed * 13.7, col = [];
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    let k = 1 + .28 * noise2(v.x * 1.2 + s, v.y * 1.2 + v.z * .8) + .1 * noise2(v.z * 3.1 - s, v.x * 3.1 + v.y);
    v.multiplyScalar(k);
    if (v.y < -.25) v.y = -.25 + (v.y + .25) * .35;
    v.y *= .72;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  const n = g.attributes.normal, mossy = new THREE.Color(.045, .065, .02), grey = new THREE.Color(.085, .08, .07), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const m = THREE.MathUtils.smoothstep(n.getY(i) + noise2(p.getX(i) * 2 + s, p.getZ(i) * 2) * .3, .35, .8);
    c.copy(grey).lerp(mossy, m).multiplyScalar(.8 + noise2(p.getX(i) * 5, p.getY(i) * 5 + s) * .2);
    col.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

export function teaBush(seed) {
  const g = welded(new THREE.IcosahedronGeometry(1, 2)), p = g.attributes.position, v = new V3(), s = seed * 7.1;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[i * 2] = Math.atan2(p.getZ(i), p.getX(i)) / 6.283 + .5; uv[i * 2 + 1] = p.getY(i) * .5 + .5; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    v.multiplyScalar(1 + .12 * noise2(v.x * 2.5 + s, v.z * 2.5 + v.y));
    if (v.y > .35) v.y = .35 + (v.y - .35) * .35;   // plucking table: flat top
    if (v.y < -.2) v.y = -.2 + (v.y + .2) * .5;
    p.setXYZ(i, v.x, v.y + .2, v.z);
  }
  g.computeVertexNormals();
  const n = g.attributes.normal, col = [];
  for (let i = 0; i < p.count; i++) {
    const top = THREE.MathUtils.smoothstep(n.getY(i), .4, .95);
    col.push(.55 + top * .55, .7 + top * .5, .45 + top * .1);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

export function canopyBlob(seed) {
  const r = mulberry32(seed), parts = [];
  for (let i = 0; i < 3; i++) {
    const g = welded(new THREE.IcosahedronGeometry(1, 1)), p = g.attributes.position, v = new V3();
    for (let k = 0; k < p.count; k++) { v.fromBufferAttribute(p, k).multiplyScalar(1 + (r() - .5) * .3); p.setXYZ(k, v.x, v.y, v.z); }
    g.scale(.8 + r() * .4, .55 + r() * .3, .8 + r() * .4);
    g.translate((r() - .5) * 1.2, .6 + i * .35, (r() - .5) * 1.2);
    parts.push(g);
  }
  const g = mergeGeometries(parts);
  g.computeVertexNormals();
  const p = g.attributes.position, col = [];
  for (let i = 0; i < p.count; i++) { const t = THREE.MathUtils.clamp(p.getY(i) / 1.6, 0, 1); col.push(.5 + t * .5, .6 + t * .5, .45 + t * .3); }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}
