// The open world: two mountains joined by a winding trail — homestay → Kelagur tea estate →
// evergreen forest → Netravathi stream → Rani Jhari ridge climb → Bandaje falls. Everything is generated from a fixed seed.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { mulberry32, noise2, fbm, ridged, smoothstep, mix, clamp } from './noise.js';
import * as TX from './textures.js';
import * as P from './plants.js';

const V3 = THREE.Vector3;
const SIZE = 1800, SEG = 450, CELL = SIZE / SEG;

// ---- Hand-placed layout (metres). x = east, z = south. -------------------------------------
export const HOME_C = { x: -426, z: -130 };
// the playing ground beside the stay (cricket + lagori, chapter 2)
export const GROUND_C = { x: -446, z: -200 }, GROUND_R = 30;
const TEA_C = { x: -232, z: 25 }, TEA_R = { x: 112, z: 78 };
export const POOL = { x: 170, z: -152 };
export const CLIFF_X = 193;
const FALL_H = 34;

// Trail control points. The route wanders over mountain A, drops down switchbacks into the
// valley, crosses the stream and climbs mountain B — never a straight line.
const ROUTE = [
  [-406, -118], [-386, -104], [-374, -78], [-350, -66], [-338, -40], [-318, -26], [-312, 4], [-300, 32], // jeep road: homestay → tea gate
  [-272, 54], [-242, 70], [-214, 48], [-234, 18], [-206, -6], [-176, 10], [-150, -12], // tea estate
  [-124, -42], [-96, -18], [-78, -54], [-50, -34], [-30, -66], [-6, -42], // evergreen forest descent
  [16, -40], [44, -28],                                           // stream crossing
  [72, -60], [60, -98], [94, -112], [112, -82], [134, -100], [126, -134], [148, -150], // climb → falls
];
// indices into ROUTE used by the story timeline
export const MARK = { teaStart: 7, teaEnd: 14, forestStart: 15, crossing: 21, climbStart: 23, end: ROUTE.length - 1 };

const RIVER = [[172, -152], [152, -170], [122, -182], [92, -162], [62, -130], [42, -92], [26, -56], [8, -14], [-12, 40], [-24, 120], [-34, 240], [-50, 420], [-62, 700], [-70, 940]];
const UPPER = [[330, -110], [296, -122], [262, -138], [228, -148], [CLIFF_X + 4, -152]];

// ---- terrain shape ---------------------------------------------------------------------------
const mount = (x, z, cx, cz, rad, ht) => ht * Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (rad * rad) * 1.6);

function natural(x, z) {
  const wx = x + fbm(x * .003 + 5, z * .003, 3) * 60, wz = z + fbm(x * .003, z * .003 + 9, 3) * 60;
  let h = 40 + fbm(x * .0022, z * .0022, 5) * 34 + ridged(x * .005, z * .005, 4) * 16 + fbm(x * .03, z * .03, 3) * 2.2;
  h += mount(wx, wz, -300, 140, 260, 185);
  h += mount(wx, wz, 300, -230, 280, 225);
  h += mount(wx, wz, -80, -430, 220, 120);
  h += mount(wx, wz, 40, 390, 240, 140);
  const r = Math.hypot(x * .9, z);
  h += smoothstep(480, 860, r) * (120 + ridged(x * .0026, z * .0026, 4) * 280);
  return h;
}

class PointGrid {
  constructor(pts, cell = 16) {
    this.c = cell; this.pts = pts; this.m = new Map();
    pts.forEach((p, i) => { const k = this.k(Math.floor(p.x / cell), Math.floor(p.z / cell)); let a = this.m.get(k); if (!a) this.m.set(k, a = []); a.push(i); });
  }
  k(i, j) { return (i + 2000) * 5000 + (j + 2000); }
  nearest(x, z, maxR) {
    const c = this.c, R = Math.ceil(maxR / c), ci = Math.floor(x / c), cj = Math.floor(z / c);
    let best = maxR * maxR, bi = -1;
    for (let i = ci - R; i <= ci + R; i++) for (let j = cj - R; j <= cj + R; j++) {
      const a = this.m.get(this.k(i, j)); if (!a) continue;
      for (const n of a) { const p = this.pts[n], d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < best) { best = d; bi = n; } }
    }
    return bi < 0 ? null : { i: bi, d: Math.sqrt(best) };
  }
}

function densePolyline(xz, step) {
  const curve = new THREE.CatmullRomCurve3(xz.map(([x, z]) => new V3(x, 0, z)), false, 'centripetal');
  const len = curve.getLength(), n = Math.max(2, Math.round(len / step));
  return { curve, len, pts: curve.getSpacedPoints(n).map(p => ({ x: p.x, z: p.z })) };
}

function smoothArr(a, rad, passes) {
  for (let k = 0; k < passes; k++) {
    const b = a.slice();
    for (let i = 0; i < a.length; i++) {
      let s = 0, n = 0;
      for (let j = Math.max(0, i - rad); j <= Math.min(a.length - 1, i + rad); j++) { s += b[j]; n++; }
      a[i] = s / n;
    }
  }
  return a;
}

// ---- shared animated uniforms + wind ---------------------------------------------------------
const U = { time: { value: 0 } };
function windify(mat, amp, pow, key) {
  mat.onBeforeCompile = sh => {
    sh.uniforms.uTime = U.time;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      float wph = 0.0;
      #ifdef USE_INSTANCING
        wph = instanceMatrix[3].x * .09 + instanceMatrix[3].z * .07;
      #endif
      float wk = ${amp.toFixed(4)} * pow(max(position.y, 0.0), ${pow.toFixed(2)});
      transformed.x += (sin(uTime * 1.6 + wph + position.x * .5) * .7 + sin(uTime * 3.7 + wph * 2.0 + position.z) * .3) * wk;
      transformed.z += cos(uTime * 1.3 + wph * 1.4 + position.z * .5) * wk * .6;`);
  };
  mat.customProgramCacheKey = () => 'wind-' + key;
  return mat;
}

export { PointGrid };
export function buildWorld(scene, renderer, { quality = 'high' } = {}) {
  const Q = quality === 'low' ? .45 : 1;
  const rnd = mulberry32(2024);
  const rr = (a, b) => a + (b - a) * rnd();

  // ---- trail + river polylines ----
  const path = densePolyline(ROUTE, 1);
  const pathGrid = new PointGrid(path.pts, 12);
  const roadEnd = pathGrid.nearest(...ROUTE[MARK.teaEnd], 40).i;
  const halfW = i => i <= roadEnd + 8 ? 3.6 : 2.6;
  const HOME_Y = natural(HOME_C.x, HOME_C.z);
  const GROUND_Y = Math.min(natural(GROUND_C.x, GROUND_C.z), HOME_Y + 6);
  const POOL_H = natural(POOL.x, POOL.z) - 5;
  const TOP_Y = POOL_H + FALL_H;

  const pathY = smoothArr(path.pts.map(p => natural(p.x, p.z)), 22, 3);
  pathY.forEach((y, i) => {
    const s = i, e = path.pts.length - 1 - i;
    pathY[i] = mix(pathY[i], HOME_Y, 1 - smoothstep(10, 40, s));
    pathY[i] = mix(pathY[i], POOL_H + 1.4, 1 - smoothstep(0, 80, e));
  });

  const mkRiver = (xz, step, y0, clampMin) => {
    const d = densePolyline(xz, step);
    let prev = y0 ?? Infinity;
    const y = d.pts.map((p, i) => {
      let v = Math.min(prev - .005 * step, natural(p.x, p.z) - 2.2);
      if (i === 0 && y0 !== undefined) v = y0;
      if (clampMin !== undefined) v = Math.max(v, clampMin);
      prev = v; return v;
    });
    smoothArr(y, 3, 2);
    for (let i = 1; i < y.length; i++) y[i] = Math.min(y[i], y[i - 1]);
    return { ...d, y, grid: new PointGrid(d.pts, 12) };
  };
  const river = mkRiver(RIVER, 2, POOL_H - .3);
  const upper = mkRiver(UPPER, 2, undefined, TOP_Y);
  upper.y[upper.y.length - 1] = TOP_Y;

  // ---- final height field ----
  const N = SEG + 1, H = new Float32Array(N * N), pathD = new Float32Array(N * N), riverD = new Float32Array(N * N);
  function shape(x, z, out) {
    let h = natural(x, z);
    const pn = pathGrid.nearest(x, z, 16);
    out.pd = pn ? pn.d : 99;
    if (pn) h = mix(h, pathY[pn.i] - .08, 1 - smoothstep(halfW(pn.i), 12, pn.d));
    const dh = Math.hypot(x - HOME_C.x, z - HOME_C.z);
    h = mix(h, HOME_Y, 1 - smoothstep(26, 46, dh));
    h = mix(h, GROUND_Y, 1 - smoothstep(GROUND_R + 4, GROUND_R + 26, Math.hypot(x - GROUND_C.x, z - GROUND_C.z)));
    // waterfall amphitheatre: steep cliff to the east, basin to the west
    const dz = Math.abs(z - POOL.z), dxp = POOL.x - x;
    const w = (1 - smoothstep(38, 82, dz)) * (1 - smoothstep(70, 120, dxp));
    if (w > 0) {
      const dxc = x - CLIFF_X, bowl = 1 - smoothstep(9, 19, Math.hypot(x - POOL.x, z - POOL.z));
      const low = POOL_H - 2.6 * bowl + Math.max(0, dxp - 14) * .2 + Math.max(0, dz - 16) * .5;
      const high = TOP_Y + Math.max(0, dxc) * .3 + fbm(x * .05, z * .05, 2) * 1.5;
      const k = smoothstep(-2.5, 2.5, dxc + noise2(z * .08, 3) * 1.2);
      const t = mix(low, high, k);
      h = mix(h, mix(Math.min(h, t), Math.max(h, t), k), w);
    }
    out.rd = 99;
    for (const rv of [river, upper]) {
      const rn = rv.grid.nearest(x, z, 30);
      if (!rn) continue;
      out.rd = Math.min(out.rd, rn.d);
      const t = rv.y[rn.i] - 1.4 + Math.max(0, rn.d - 3.2) * .62;
      h = mix(h, Math.min(h, t), 1 - smoothstep(20, 30, rn.d));
    }
    return h;
  }
  const tmp = {};
  for (let iy = 0; iy < N; iy++) for (let ix = 0; ix < N; ix++) {
    const x = -SIZE / 2 + ix * CELL, z = -SIZE / 2 + iy * CELL, i = iy * N + ix;
    H[i] = shape(x, z, tmp); pathD[i] = tmp.pd; riverD[i] = tmp.rd;
  }
  function heightAt(x, z) {
    const fx = clamp((x + SIZE / 2) / CELL, 0, SEG - 1e-3), fz = clamp((z + SIZE / 2) / CELL, 0, SEG - 1e-3);
    const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz, i = iz * N + ix;
    return mix(mix(H[i], H[i + 1], tx), mix(H[i + N], H[i + N + 1], tx), tz);
  }
  const fieldAt = (arr, x, z) => {
    const ix = Math.round(clamp((x + SIZE / 2) / CELL, 0, SEG)), iz = Math.round(clamp((z + SIZE / 2) / CELL, 0, SEG));
    return arr[iz * N + ix];
  };
  const slopeAt = (x, z) => Math.hypot(heightAt(x + 2, z) - heightAt(x - 2, z), heightAt(x, z + 2) - heightAt(x, z - 2)) / 4;

  // ---- zones ----
  const teaW = (x, z) => {
    const e = ((x - TEA_C.x) / TEA_R.x) ** 2 + ((z - TEA_C.z) / TEA_R.z) ** 2 + fbm(x * .02, z * .02, 2) * .25;
    return 1 - smoothstep(.72, 1, e);
  };
  const grassW = (x, z, h) => smoothstep(196, 214, h + fbm(x * .008, z * .008, 3) * 22) * (1 - teaW(x, z));
  const groundClear = (x, z) => 1 - smoothstep(GROUND_R + 2, GROUND_R + 12, Math.hypot(x - GROUND_C.x, z - GROUND_C.z));
  const homeClear = (x, z) => Math.max(groundClear(x, z), 1 - smoothstep(30, 48, Math.hypot(x - HOME_C.x, z - HOME_C.z)));
  const fallsClear = (x, z) => Math.abs(z - POOL.z) < 30 && x > CLIFF_X - 32 && x < CLIFF_X + 6;
  // keep the view from the pool shore to the falls open (no tall trees between)
  const fallsView = (x, z) => Math.abs(z - POOL.z) < 30 + Math.max(0, CLIFF_X - 60 - x) * .4 && x > CLIFF_X - 95 && x < CLIFF_X + 6;

  // ---- terrain mesh ----
  const tGeo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  tGeo.rotateX(-Math.PI / 2);
  const pos = tGeo.attributes.position, colors = new Float32Array(pos.count * 3);
  const C = (r, g, b) => new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);
  const cForest = C(.2, .2, .1), cGrass = C(.38, .43, .16), cDry = C(.52, .5, .25), cTea = C(.18, .27, .08),
    cSoil = C(.42, .29, .19), cRock = C(.3, .29, .27), cTrail = C(.52, .3, .19), cWet = C(.16, .16, .12), cCanopy = C(.12, .2, .08), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), h = H[i];
    pos.setY(i, h);
    const sl = slopeAt(x, z), n = fbm(x * .04, z * .04, 3);
    const gw = grassW(x, z, h), tw = teaW(x, z);
    c.copy(cForest).lerp(cCanopy, smoothstep(60, 160, pathD[i] === 99 ? 200 : pathD[i]) * .8);
    c.lerp(cGrass, Math.max(gw, homeClear(x, z) * .9)).lerp(cDry, gw * smoothstep(-.1, .5, n) * .6);
    c.lerp(cTea, tw);
    c.lerp(cSoil, smoothstep(.7, 1.1, sl) * .7).lerp(cRock, smoothstep(1.1, 1.8, sl));
    c.lerp(cWet, 1 - smoothstep(5, 9, riverD[i]));
    c.lerp(cTrail, (1 - smoothstep(1.8, 4.2, pathD[i])) * .85);
    { const gx = x - GROUND_C.x, gz = z - GROUND_C.z, gd = Math.hypot(gx, gz);
      if (gd < GROUND_R + 8) { c.lerp(cGrass, (1 - smoothstep(GROUND_R - 4, GROUND_R + 6, gd)) * .7); c.lerp(cDry, (1 - smoothstep(4, 14, gd)) * .75 * smoothstep(-.3, .4, fbm(x * .09, z * .09, 2))); } }
    c.multiplyScalar(.85 + n * .25);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  tGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  tGeo.computeVertexNormals();
  const detail = TX.detailTex(); detail.repeat.set(SIZE / 5, SIZE / 5);
  const terrain = new THREE.Mesh(tGeo, new THREE.MeshStandardMaterial({ vertexColors: true, map: detail, roughness: .96 }));
  terrain.receiveShadow = true;
  scene.add(terrain);

  // ---- route as walked (rides over the bridge at the stream) ----
  const routeY = path.pts.map((p, i) => {
    let y = Math.max(heightAt(p.x, p.z), pathY[i] - 4);
    const rn = river.grid.nearest(p.x, p.z, 9);
    if (rn) y = Math.max(y, river.y[rn.i] + 1.2);
    return y;
  });
  smoothArr(routeY, 4, 2);
  const routePts = path.pts.map((p, i) => new V3(p.x, routeY[i], p.z));
  const routeLen = routePts.length - 1; // 1 m spacing
  const ctrlS = ROUTE.map(([x, z]) => pathGrid.nearest(x, z, 40).i);
  const route = {
    pts: routePts, len: routeLen, ctrlS,
    at(s) {
      s = clamp(s, 0, routeLen);
      const i = Math.min(routeLen - 1, Math.floor(s)), t = s - i;
      const p = routePts[i].clone().lerp(routePts[i + 1], t);
      const a = routePts[Math.max(0, i - 6)], b = routePts[Math.min(routeLen, i + 7)];
      const dir = new V3(b.x - a.x, 0, b.z - a.z).normalize();
      return { p, dir };
    },
  };

  // ---- materials ----
  const leafTex = TX.leafAtlas(), barkTex = TX.barkTex();
  const barkMat = new THREE.MeshStandardMaterial({ map: barkTex, roughness: .95 });
  const leafMat = windify(new THREE.MeshStandardMaterial({ map: leafTex, alphaTest: .42, side: THREE.DoubleSide, vertexColors: true, roughness: .78 }), .012, 1, 'leaf');
  const frondMat = windify(new THREE.MeshStandardMaterial({ map: TX.frondTex(), alphaTest: .4, side: THREE.DoubleSide, vertexColors: true, roughness: .75 }), .02, 1, 'frond');
  const bananaMat = windify(new THREE.MeshStandardMaterial({ map: TX.bananaTex(), alphaTest: .4, side: THREE.DoubleSide, vertexColors: true, roughness: .7 }), .03, 1, 'banana');
  const fernMat = windify(new THREE.MeshStandardMaterial({ map: TX.fernTex(), alphaTest: .4, side: THREE.DoubleSide, vertexColors: true, roughness: .8 }), .06, 1.5, 'fern');
  const grassMat = windify(new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: .9 }), .16, 2, 'grass');
  const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .88 });
  const teaT = TX.teaTex(); teaT.repeat.set(3, 2);
  const teaMat = new THREE.MeshStandardMaterial({ map: teaT, vertexColors: true, roughness: .85 });
  const canopyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  const flowerMat = new THREE.MeshStandardMaterial({ roughness: .6, emissive: 0x222222 });

  const dummy = new THREE.Object3D(), tint = new THREE.Color();
  function instanced(geo, mat, list, { shadow = true, receive = true } = {}) {
    if (!list.length) return null;
    const m = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((it, i) => {
      dummy.position.set(it.x, it.y, it.z);
      dummy.rotation.set(it.tx || 0, it.ry || 0, it.tz || 0);
      dummy.scale.set(it.sx ?? it.s, it.sy ?? it.s, it.sz ?? it.s);
      dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix);
      if (it.c) m.setColorAt(i, it.c);
    });
    m.castShadow = shadow; m.receiveShadow = receive;
    scene.add(m);
    return m;
  }
  // species = list of { bark, leaves, leafMat, barkTint, leafTint }, placements spread across them
  function plant(species, items, opts) {
    const buckets = species.map(() => []);
    items.forEach(it => buckets[Math.floor(rnd() * species.length)].push(it));
    species.forEach((sp, k) => {
      const L = buckets[k];
      if (sp.bark) instanced(sp.bark, barkMat, L.map(it => ({ ...it, c: tint.set(sp.barkTint || 0xffffff).clone().multiplyScalar(.8 + rnd() * .3) })), opts);
      instanced(sp.leaves, sp.mat || leafMat, L.map(it => ({ ...it, c: new THREE.Color(sp.leafTint || 0xffffff).offsetHSL((rnd() - .5) * .03, 0, (rnd() - .5) * .08) })), opts);
    });
  }

  // ---- species catalogue (each variant grown from its own seed) ----
  const broad = [
    { o: { h: 18, trunk: .42, r: .5, depth: 3, branches: 3, angle: .75, decay: .72, upBias: .4, leaf: 3.2, variant: 0, mix: .3 }, tint: 0xffffff },
    { o: { h: 22, trunk: .5, r: .6, depth: 3, branches: 4, angle: .9, decay: .68, upBias: .2, leaf: 3.6, variant: 0, mix: .1, buttress: true }, tint: 0xe8f0d8 },
    { o: { h: 14, trunk: .35, r: .38, depth: 3, branches: 3, angle: 1.0, decay: .75, upBias: .1, leaf: 3, variant: 1, mix: .2 }, tint: 0xf3ffe0 },
    { o: { h: 26, trunk: .55, r: .7, depth: 3, branches: 4, angle: .7, decay: .66, upBias: .5, leaf: 3.8, variant: 0, mix: .2, buttress: true }, tint: 0xd8e6c8 },
    { o: { h: 16, trunk: .4, r: .42, depth: 3, branches: 2, angle: .85, decay: .78, upBias: .3, leaf: 3.1, variant: 1, mix: 0 }, tint: 0xffe0c8 }, // new reddish flush
    { o: { h: 12, trunk: .3, r: .32, depth: 2, branches: 4, angle: 1.1, decay: .8, upBias: 0, leaf: 3.4, variant: 0, mix: .5 }, tint: 0xffffff },
    { o: { h: 30, trunk: .62, r: .8, depth: 3, branches: 3, angle: .65, decay: .6, upBias: .2, leaf: 4.2, variant: 0, mix: .3, buttress: true }, tint: 0xe2ead0 },
    { o: { h: 20, trunk: .45, r: .5, depth: 3, branches: 3, angle: .95, decay: .7, upBias: .35, leaf: 3.3, variant: 1, mix: .4 }, tint: 0xfff4c8 },
  ].map((d, i) => ({ ...P.broadleaf(100 + i * 17, d.o), leafTint: d.tint, h: d.o.h }));
  const oaks = [0, 1, 2].map(i => ({ ...P.silverOak(300 + i * 11, { h: 20 + i * 3, r: .32, n: 16 + i * 3 }), leafTint: 0xd8dcc0 }));
  const areca = [0, 1].map(i => ({ ...P.palm(400 + i, { h: 13 + i * 2, r: .13, lean: .12, fronds: 8, len: 2.6, droop: .9, width: 1.3 }), mat: frondMat, barkTint: 0xbdb8a8 }));
  const coconut = [0, 1].map(i => ({ ...P.palm(500 + i, { h: 12 + i * 3, r: .22, lean: .5, fronds: 14, len: 4.2, droop: 1.8, width: 1.5, nuts: true }), mat: frondMat, barkTint: 0xb0a490 }));
  const bananas = [0, 1].map(i => ({ ...P.banana(600 + i), mat: bananaMat, barkTint: 0x7f9a48 }));
  const bamboos = [0, 1].map(i => ({ ...P.bamboo(700 + i), barkTint: 0xa8b860, leafTint: 0xe6f0b0 }));
  const shrubs = [0, 1, 2, 3].map(i => ({ leaves: P.shrub(800 + i, i % 2), leafTint: i === 3 ? 0xd0e8a0 : 0xffffff }));
  const ferns = [0, 1, 2].map(i => ({ leaves: P.fern(900 + i), mat: fernMat }));

  // ---- tree placement around the trail (dense, varied) ----
  const forestTrees = [], teaOaks = [], bambooList = [], shrubList = [], fernList = [], grassList = [], rockList = [], flowerList = [], bigRocks = [];
  const NP = path.pts.length;
  const lateral = (i) => { const a = path.pts[Math.max(0, i - 3)], b = path.pts[Math.min(NP - 1, i + 3)]; const l = Math.hypot(b.x - a.x, b.z - a.z) || 1; return [-(b.z - a.z) / l, (b.x - a.x) / l]; };
  function nearTrail(minOff, maxOff, pow) {
    const i = Math.floor(rnd() * NP), [nx, nz] = lateral(i), side = rnd() < .5 ? -1 : 1;
    const off = minOff + Math.pow(rnd(), pow) * (maxOff - minOff);
    return { x: path.pts[i].x + nx * off * side + rr(-3, 3), z: path.pts[i].z + nz * off * side + rr(-3, 3) };
  }
  const near = (x, z, r) => { const n = pathGrid.nearest(x, z, r); return n ? n.d : 1e9; };
  const rDist = (x, z) => { const a = river.grid.nearest(x, z, 40), b = upper.grid.nearest(x, z, 40); return Math.min(a ? a.d : 1e9, b ? b.d : 1e9); };

  for (let k = 0; k < 9000 * Q; k++) {
    const { x, z } = nearTrail(5, 95, 1.3);
    const h = heightAt(x, z), pd = near(x, z, 24), rd = rDist(x, z);
    if (rd < 5.5 || fallsView(x, z) || homeClear(x, z) > .2 || slopeAt(x, z) > 1.3) continue;
    const tw = teaW(x, z), gw = grassW(x, z, h), dens = .55 + fbm(x * .015, z * .015, 2) * .6;
    if (tw > .5) { if (rnd() < .07 && pd > 6) teaOaks.push({ x, y: h - .3, z, s: rr(.85, 1.15), ry: rnd() * 6.3 }); continue; }
    if (rnd() > (1 - gw * .95) * dens) continue;
    const s = rr(.7, 1.2), crown = 5.5 * s, pn = pathGrid.nearest(x, z, 24);
    if (pd < crown * .55 + 3 + (pn && pn.i <= roadEnd ? 2.5 : 0)) continue;
    forestTrees.push({ x, y: h - .2, z, s, ry: rnd() * 6.3, tx: rr(-.04, .04), tz: rr(-.04, .04) });
  }
  // bamboo thickets along the stream
  for (let k = 0; k < 900 * Q && bambooList.length < 90 * Q; k++) {
    const i = Math.floor(rnd() * river.pts.length * .55), p = river.pts[i], a = rnd() * 6.283, d = rr(7, 18);
    const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
    if (near(x, z, 10) < 6 || rDist(x, z) < 6 || fallsView(x, z)) continue;
    bambooList.push({ x, y: heightAt(x, z) - .2, z, s: rr(.75, 1.1), ry: rnd() * 6.3 });
  }

  // homestay plantation: areca rows behind the house, banana + coconut around the yard
  const arecaList = [], coconutList = [], bananaList = [];
  for (let i = 0; i < 9; i++) for (let j = 0; j < 7; j++) {
    const x = HOME_C.x - 30 - i * 4.2 + rr(-.8, .8), z = HOME_C.z - 22 + j * 4.4 + rr(-.8, .8);
    arecaList.push({ x, y: heightAt(x, z) - .1, z, s: rr(.85, 1.15), ry: rnd() * 6.3 });
  }
  for (let k = 0; k < 7; k++) { const a = rr(-1.2, 1.4), d = rr(20, 30), x = HOME_C.x + Math.cos(a) * d, z = HOME_C.z + Math.sin(a) * d; if (near(x, z, 8) > 6.5) coconutList.push({ x, y: heightAt(x, z), z, s: rr(.9, 1.1), ry: rnd() * 6.3 }); }
  for (let k = 0; k < 16; k++) { const a = rr(1.6, 5), d = rr(12, 24), x = HOME_C.x + Math.cos(a) * d, z = HOME_C.z + Math.sin(a) * d; if (near(x, z, 8) > 6) bananaList.push({ x, y: heightAt(x, z), z, s: rr(.85, 1.2), ry: rnd() * 6.3 }); }

  plant(broad, forestTrees);
  plant(oaks, [...teaOaks, ...Array.from({ length: 10 }, () => { const a = rnd() * 6.283, d = rr(34, 44), x = HOME_C.x + Math.cos(a) * d, z = HOME_C.z + Math.sin(a) * d; return { x, y: heightAt(x, z), z, s: rr(.9, 1.1), ry: rnd() * 6 }; }).filter(o => groundClear(o.x, o.z) < .05),
    ...Array.from({ length: 22 }, (_, k) => { const a = k / 22 * 6.283 + rr(-.1, .1), d = GROUND_R + rr(9, 15), x = GROUND_C.x + Math.cos(a) * d, z = GROUND_C.z + Math.sin(a) * d; return { x, y: heightAt(x, z), z, s: rr(.9, 1.15), ry: rnd() * 6 }; }).filter(o => Math.hypot(o.x - HOME_C.x, o.z - HOME_C.z) > 24)]);
  plant(areca, arecaList); plant(coconut, coconutList); plant(bananas, bananaList); plant(bamboos, bambooList);

  // ---- far canopy: cheap crowns blanket the rest of both mountains ----
  const blobGeos = [P.canopyBlob(1), P.canopyBlob(2)], blobs = [[], []];
  for (let x = -SIZE / 2 + 10; x < SIZE / 2 - 10; x += 9.5 / Math.sqrt(Q)) for (let z = -SIZE / 2 + 10; z < SIZE / 2 - 10; z += 9.5 / Math.sqrt(Q)) {
    const px = x + rr(-4, 4), pz = z + rr(-4, 4);
    if (fieldAt(pathD, px, pz) < 99 || pathGrid.nearest(px, pz, 90)) continue;
    const h = heightAt(px, pz);
    if (teaW(px, pz) > .3 || grassW(px, pz, h) > .4 || homeClear(px, pz) > 0 || slopeAt(px, pz) > 1.4 || fallsView(px, pz)) continue;
    if (fieldAt(riverD, px, pz) < 6) continue;
    if (fbm(px * .01, pz * .01, 3) < -.35 + h / 900) continue;
    const s = rr(3.5, 6.5);
    blobs[rnd() < .5 ? 0 : 1].push({ x: px, y: h + s * .4, z: pz, s, sy: s * rr(.9, 1.4), ry: rnd() * 6.3,
      c: new THREE.Color().setHSL(rr(.22, .3), rr(.35, .55), rr(.13, .22)) });
  }
  blobs.forEach((L, i) => instanced(blobGeos[i], canopyMat, L, { shadow: false, receive: false }));

  // ---- tea estate: contour-following clipped hedges ----
  const teaGeos = [P.teaBush(1), P.teaBush(2), P.teaBush(3)], teaLists = [[], [], []];
  for (let x = TEA_C.x - TEA_R.x; x < TEA_C.x + TEA_R.x; x += 1.35) for (let z = TEA_C.z - TEA_R.z; z < TEA_C.z + TEA_R.z; z += 1.35) {
    const px = x + rr(-.3, .3), pz = z + rr(-.3, .3);
    if (teaW(px, pz) < .55 || near(px, pz, 4) < 2.2) continue;
    const h = heightAt(px, pz), phase = (h / 1.75 + fbm(px * .05, pz * .05, 1) * .05) % 1;
    if ((phase + 1) % 1 > .42) continue;
    const gx = heightAt(px + 1, pz) - heightAt(px - 1, pz), gz = heightAt(px, pz + 1) - heightAt(px, pz - 1);
    teaLists[Math.floor(rnd() * 3)].push({ x: px, y: h - .1, z: pz, ry: Math.atan2(gx, gz), sx: rr(1.4, 1.8), sy: rr(.75, .95), sz: rr(.85, 1.05),
      c: new THREE.Color().setHSL(rr(.24, .28), rr(.55, .7), rr(.42, .52)) });
  }
  teaLists.forEach((L, i) => instanced(teaGeos[i], teaMat, L));

  // ---- ground layer: grass, shrubs, ferns, rocks, flowers ----
  const grassGeos = [0, 1, 2, 3].map(i => P.grassClump(1000 + i, 8 + i * 2));
  const gLists = [[], [], [], []];
  const pushGrass = (x, z, dense) => {
    if (rDist(x, z) < 4.5 || near(x, z, 3) < 1.1 || fallsClear(x, z) && x > CLIFF_X - 4) return;
    const h = heightAt(x, z), gw = Math.max(grassW(x, z, h), homeClear(x, z)), tw = teaW(x, z);
    if (tw > .5 && near(x, z, 5) > 3.4) return;
    if (rnd() > (dense ? 1 : .25 + gw * .75)) return;
    gLists[Math.floor(rnd() * 4)].push({ x, y: h - .05, z, s: rr(.8, 1.4) * (1 + gw * .4), ry: rnd() * 6.3,
      c: new THREE.Color().setHSL(mix(.25, .16, gw * rnd()), rr(.35, .6), rr(.38, .58)) });
  };
  for (let k = 0; k < 42000 * Q; k++) { const p = nearTrail(1.2, 32, 2.2); pushGrass(p.x, p.z, false); }
  for (let k = 0; k < 5000 * Q; k++) { const a = rnd() * 6.283, d = 11 + Math.sqrt(rnd()) * 33, x = HOME_C.x + Math.cos(a) * d, z = HOME_C.z + Math.sin(a) * d; if (Math.hypot(x - GROUND_C.x, z - GROUND_C.z) > GROUND_R - 2) pushGrass(x, z, true); }
  for (let k = 0; k < 1800 * Q; k++) { const a = rnd() * 6.283, d = GROUND_R - 3 + rnd() * 14; pushGrass(GROUND_C.x + Math.cos(a) * d, GROUND_C.z + Math.sin(a) * d, true); }
  gLists.forEach((L, i) => instanced(grassGeos[i], grassMat, L, { shadow: false }));

  for (let k = 0; k < 4200 * Q; k++) {
    const { x, z } = nearTrail(3.4, 40, 1.6), h = heightAt(x, z);
    if (rDist(x, z) < 4 || teaW(x, z) > .45 || homeClear(x, z) > .5 || near(x, z, 5) < 3.2 || fallsView(x, z)) continue;
    const gw = grassW(x, z, h);
    if (rnd() < .55) shrubList.push({ x, y: h - .2, z, s: rr(.6, 1.4) * (1 - gw * .4), ry: rnd() * 6.3 });
    else if (gw < .5) fernList.push({ x, y: h - .05, z, s: rr(.7, 1.5), ry: rnd() * 6.3 });
  }
  for (let k = 0; k < 900 * Q; k++) { // ferns + rocks crowd the stream banks
    const i = Math.floor(rnd() * river.pts.length * .6), p = river.pts[i], a = rnd() * 6.283, d = rr(3.5, 12);
    const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d, h = heightAt(x, z);
    if (rnd() < .5) fernList.push({ x, y: h, z, s: rr(.8, 1.6), ry: rnd() * 6.3 });
    else rockList.push({ x, y: Math.max(h, river.y[i] - .4), z, s: rr(.3, 1.4), ry: rnd() * 6.3 });
  }
  for (let k = 0; k < 350 * Q; k++) { const { x, z } = nearTrail(1.8, 30, 2); if (near(x, z, 3) > 1.6) rockList.push({ x, y: heightAt(x, z) - .1, z, s: rr(.2, .9), ry: rnd() * 6.3 }); }
  plant(shrubs, shrubList); plant(ferns, fernList, { shadow: false });

  const flowerGeo = new THREE.IcosahedronGeometry(.075, 0);
  const flowerCols = [0x9b6bd6, 0xe86aa6, 0xf5e6f0, 0xf4c542, 0xff7f50];
  for (let k = 0; k < 3500 * Q; k++) {
    const { x, z } = nearTrail(1.2, 14, 1.8), h = heightAt(x, z);
    if (rDist(x, z) < 4 || teaW(x, z) > .5 || near(x, z, 3) < 1) continue;
    const gw = grassW(x, z, h);
    flowerList.push({ x, y: h + rr(.25, .6), z, s: rr(.8, 1.4), c: new THREE.Color(gw > .5 && rnd() < .7 ? flowerCols[0] : flowerCols[1 + Math.floor(rnd() * 4)]) });
  }
  instanced(flowerGeo, flowerMat, flowerList, { shadow: false });

  // ---- waterfall amphitheatre ----
  for (let k = 0; k < 140; k++) { // stacked boulders dress the cliff face and basin
    const z = POOL.z + rr(-44, 44), dz = Math.abs(z - POOL.z), onFace = rnd() < .65;
    if (onFace) {
      if (dz < 8) continue;
      const y = POOL_H + rr(-1, FALL_H + 2), x = CLIFF_X + rr(.5, 4) + (y - POOL_H) * .05;
      bigRocks.push({ x, y, z, s: rr(2.5, 6.5), ry: rnd() * 6.3, tx: rr(-.4, .4) });
    } else {
      const a = rnd() * 6.283, d = rr(14, 30), x = POOL.x + Math.cos(a) * d, zz = POOL.z + Math.sin(a) * d;
      if (near(x, zz, 4) < 3) continue;
      bigRocks.push({ x, y: heightAt(x, zz) - .3, z: zz, s: rr(.8, 2.8), ry: rnd() * 6.3 });
    }
  }
  for (let k = 0; k < 10; k++) bigRocks.push({ x: CLIFF_X + 6 + rr(0, 3), y: POOL_H + rr(0, FALL_H), z: POOL.z + rr(-5, 5), s: rr(3, 5), ry: rnd() * 6.3 }); // wet rock behind the curtain
  const rockGeos = [0, 1, 2, 3, 4].map(i => P.rock(i + 1, 3));
  const rocksAll = [...rockList, ...bigRocks], rLists = rockGeos.map(() => []);
  rocksAll.forEach(it => rLists[Math.floor(rnd() * rLists.length)].push(it));
  rLists.forEach((L, i) => instanced(rockGeos[i], rockMat, L));

  // ---- water ----
  const waterN = TX.waterNormalTex();
  const waterMat = new THREE.MeshStandardMaterial({ color: 0x1f3d36, roughness: .06, metalness: .1, normalMap: waterN, normalScale: new THREE.Vector2(.55, .55), transparent: true, opacity: .9, envMapIntensity: 1.3 });
  function ribbon(rv, width) {
    const pos = [], uv = [], idx = [];
    rv.pts.forEach((p, i) => {
      const a = rv.pts[Math.max(0, i - 1)], b = rv.pts[Math.min(rv.pts.length - 1, i + 1)], l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      const nx = -(b.z - a.z) / l, nz = (b.x - a.x) / l, w = width * (1 + noise2(i * .05, 1) * .25);
      for (const s of [-1, 1]) { pos.push(p.x + nx * w / 2 * s, rv.y[i], p.z + nz * w / 2 * s); uv.push(s < 0 ? 0 : w / 8, i * 2 / 8); }
      if (i) { const k = (i - 1) * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, waterMat); m.receiveShadow = true; scene.add(m);
  }
  ribbon(river, 11); ribbon(upper, 7);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(21, 64).rotateX(-Math.PI / 2), waterMat);
  pool.position.set(POOL.x, POOL_H - .3, POOL.z); scene.add(pool);

  const fallMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uBright: { value: 1 } }]),
    vertexShader: `varying vec2 vUv;
      #include <fog_pars_vertex>
      void main(){ vUv = uv; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader: `uniform float uTime; uniform float uBright; varying vec2 vUv;
      #include <fog_pars_fragment>
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
        return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
      void main(){
        float y = vUv.y;
        vec2 p = vec2(vUv.x * 28., y * 5. + uTime * 3.4);
        float n = vn(p) * .55 + vn(p * vec2(2.3, 1.7) + 7.) * .3 + vn(p * 5.1 + 3.) * .15;
        float streak = smoothstep(.3, .82, n);
        float edge = smoothstep(0., .14, vUv.x) * smoothstep(1., .86, vUv.x);
        edge *= smoothstep(0., .25, vUv.x + n * .2) * smoothstep(1., .75, vUv.x - n * .2);
        float a = edge * (.32 + .62 * streak) * smoothstep(1., .96, y);
        vec3 col = mix(vec3(.6, .7, .72), vec3(1.), streak) * uBright;
        col = mix(col, vec3(1.05), smoothstep(.22, 0., y) * .7);
        gl_FragColor = vec4(col, clamp(a + smoothstep(.15, 0., y) * edge * .4, 0., 1.));
        #include <fog_fragment>
      }`,
  });
  {
    const g = new THREE.PlaneGeometry(1, 1, 16, 40), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i) + .5, v = .5 - p.getY(i); // v: 0 top → 1 bottom
      const w = mix(8, 13, v);
      p.setXYZ(i, CLIFF_X + 3 - 6.6 * Math.sqrt(v), mix(TOP_Y + .3, POOL_H - .4, v), POOL.z + (u - .5) * w);
    }
    g.computeVertexNormals();
    scene.add(new THREE.Mesh(g, fallMat));
    const g2 = g.clone(); g2.translate(-.35, 0, 0);
    const m2 = new THREE.Mesh(g2, fallMat.clone()); m2.material.uniforms.uBright.value = .8; m2.material.uniforms.uTime = fallMat.uniforms.uTime;
    scene.add(m2);
  }
  const foam = new THREE.Mesh(new THREE.CircleGeometry(8, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: TX.softTex(), transparent: true, opacity: .8, depthWrite: false }));
  foam.position.set(CLIFF_X - 4, POOL_H - .2, POOL.z); foam.scale.set(1, 1, 1.4); scene.add(foam);

  // ---- mist & cloud sprites ----
  const soft = TX.softTex(), cloud = TX.cloudTex();
  const spray = Array.from({ length: 46 }, (_, i) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: soft, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
    s.userData = { ph: i / 46, z: rr(-7, 7), x: rr(-6, 0) };
    scene.add(s); return s;
  });
  const mists = [];
  for (let i = 0; i < 46; i++) {
    const rv = rnd() < .7 ? river : null, p = rv ? river.pts[Math.floor(rr(.05, .75) * river.pts.length)] : { x: rr(-500, 500), z: rr(-500, 500) };
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloud, color: 0xf4efe6, transparent: true, opacity: rr(.16, .32), depthWrite: false }));
    const sc = rr(70, 170);
    s.scale.set(sc, sc * .45, 1);
    s.position.set(p.x + rr(-40, 40), heightAt(p.x, p.z) + rr(12, 34), p.z + rr(-40, 40));
    s.userData = { vx: rr(-.6, .6), base: s.position.clone(), op: s.material.opacity };
    scene.add(s); mists.push(s);
  }
  const clouds = [];
  for (let i = 0; i < 26; i++) {
    const a = rnd() * 6.283, d = rr(700, 1100);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloud, color: 0xfff6ea, transparent: true, opacity: rr(.5, .85), depthWrite: false, fog: false }));
    const sc = rr(260, 520); s.scale.set(sc, sc * .4, 1);
    s.position.set(Math.cos(a) * d, rr(380, 620), Math.sin(a) * d);
    scene.add(s); clouds.push(s);
  }

  // ---- log bridge over the stream ----
  {
    let a = -1, b = -1;
    routePts.forEach((p, i) => { if (p.y - heightAt(p.x, p.z) > .55 && i > ctrlS[MARK.crossing - 2]) { if (a < 0) a = i; b = i; } });
    if (a > 0) {
      const A = routePts[Math.max(0, a - 3)], B = routePts[Math.min(routeLen, b + 3)];
      const dir = B.clone().sub(A), len = dir.length(); dir.normalize();
      const side = new V3(-dir.z, 0, dir.x);
      for (const o of [-.38, 0, .38]) {
        const log = new THREE.Mesh(new THREE.CylinderGeometry(.24, .27, len, 9), barkMat);
        log.position.copy(A).add(B).multiplyScalar(.5).addScaledVector(side, o); log.position.y -= .35;
        log.quaternion.setFromUnitVectors(new V3(0, 1, 0), dir); log.castShadow = log.receiveShadow = true; scene.add(log);
      }
      for (const s of [-1, 1]) {
        const posts = [A, B].map(p => { const m = new THREE.Mesh(new THREE.CylinderGeometry(.08, .1, 1.6, 6), barkMat); m.position.copy(p).addScaledVector(side, s * .85); m.position.y += .2; scene.add(m); return m.position; });
        const rope = new THREE.Mesh(new THREE.CylinderGeometry(.025, .025, len, 5), new THREE.MeshStandardMaterial({ color: 0x8a7650 }));
        rope.position.copy(posts[0]).add(posts[1]).multiplyScalar(.5); rope.position.y += .7; rope.quaternion.setFromUnitVectors(new V3(0, 1, 0), posts[1].clone().sub(posts[0]).normalize()); scene.add(rope);
      }
    }
  }

  // ---- the homestay (Malnad style: white walls, red-oxide plinth, Mangalore-tile hip roof) ----
  const homeGlass = buildHomestay(scene, HOME_C, HOME_Y, route.at(8).p, barkTex, detail);

  // ---- trail surface ----
  {
    const pos = [], uv = [], idx = [];
    for (let i = 0; i < NP; i++) {
      const [nx, nz] = lateral(i), p = path.pts[i], W = halfW(i) * (i <= roadEnd ? 1.05 : 1);
      for (const s of [-1, 1]) { const x = p.x + nx * W / 2 * s, z = p.z + nz * W / 2 * s; pos.push(x, heightAt(x, z) + .06, z); uv.push(s < 0 ? 0 : 1, i / 6); }
      if (i) { const k = (i - 1) * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: TX.trailTex(), transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.receiveShadow = true; scene.add(m);
  }

  // ---- wildlife ambience: birds over the valley, butterflies on the slopes ----
  const birdMat = new THREE.MeshStandardMaterial({ color: 0x1b1c1a, side: THREE.DoubleSide, roughness: 1 });
  const wingGeo = new THREE.PlaneGeometry(.9, .32).translate(.45, 0, 0).rotateX(-Math.PI / 2);
  const birds = [];
  for (let f = 0; f < 4; f++) {
    const cx = rr(-250, 200), cz = rr(-200, 120), rad = rr(60, 140), hgt = rr(150, 240), sp = rr(.05, .09) * (rnd() < .5 ? -1 : 1);
    for (let k = 0; k < 6; k++) {
      const b = new THREE.Group(), L = new THREE.Mesh(wingGeo, birdMat), R = new THREE.Mesh(wingGeo, birdMat);
      R.scale.x = -1; b.add(L, R, new THREE.Mesh(new THREE.CapsuleGeometry(.09, .5, 2, 6).rotateX(Math.PI / 2), birdMat));
      b.scale.setScalar(1.6);
      b.userData = { cx, cz, rad, hgt, sp, off: k * .05 + rnd() * .02, dr: rr(-8, 8), dy: rr(-4, 4), L, R, ph: rnd() * 6 };
      scene.add(b); birds.push(b);
    }
  }
  const bflyGeo = new THREE.PlaneGeometry(.22, .22).translate(.11, 0, 0).rotateX(-Math.PI / 2);
  const bflyMat = new THREE.MeshBasicMaterial({ map: TX.butterflyTex(), transparent: true, alphaTest: .3, side: THREE.DoubleSide });
  const butterflies = [];
  for (let k = 0; k < 46; k++) {
    const i = Math.floor(rr(0, ctrlS[MARK.forestStart + 3])), p = path.pts[i], a = rnd() * 6.283, d = rr(2, 7);
    const b = new THREE.Group(), L = new THREE.Mesh(bflyGeo, bflyMat), R = new THREE.Mesh(bflyGeo, bflyMat);
    R.scale.x = -1; b.add(L, R);
    const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
    b.userData = { home: new V3(x, heightAt(x, z) + rr(.8, 2), z), L, R, ph: rnd() * 10, sp: rr(.4, .9) };
    scene.add(b); butterflies.push(b);
  }

  // ---- sky, sun, environment light ----
  const sky = new Sky(); sky.scale.setScalar(9000);
  const su = sky.material.uniforms;
  su.turbidity.value = 7; su.rayleigh.value = 1.5; su.mieCoefficient.value = .006; su.mieDirectionalG.value = .82;
  const sunDir = new V3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 21), THREE.MathUtils.degToRad(238));
  su.sunPosition.value.copy(sunDir);
  scene.add(sky);
  const pm = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene(); const sky2 = new Sky(); sky2.scale.setScalar(9000); sky2.material.uniforms.sunPosition.value.copy(sunDir);
  Object.keys(su).forEach(k => { if (k !== 'sunPosition') sky2.material.uniforms[k].value = su[k].value; });
  envScene.add(sky2);
  scene.environment = pm.fromScene(envScene, .02).texture;
  scene.fog = new THREE.FogExp2(0xbcc7c2, .00085);

  const sun = new THREE.DirectionalLight(0xffe0b5, 3.1);
  sun.castShadow = quality !== 'low';
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -75, right: 75, top: 75, bottom: -75, near: 10, far: 520 });
  sun.shadow.bias = -.0004; sun.shadow.normalBias = .5;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xcfe0ff, 0x3a3a22, .55);
  scene.add(hemi);

  // ---- night sky (campfire): stars, the Milky Way and a moon — hidden by day ----
  const night = new THREE.Group(); night.visible = false; scene.add(night);
  {
    const N = 4200, pos = [], size = [], ph = [], col = [];
    // the Milky Way arcs overhead, running out past the playing ground (where the stargazing shot looks)
    const away = new V3(GROUND_C.x - HOME_C.x, 0, GROUND_C.z - HOME_C.z).normalize();
    const band = new V3(0, 1, 0).cross(away).addScaledVector(away, -.18).normalize(), bx = new V3(1, 0, 0).cross(band).normalize(), by = band.clone().cross(bx);
    for (let i = 0; i < N; i++) {
      let d;
      if (i < N * .45) { // Milky Way: crowded along a tilted great circle
        const a = rnd() * 6.283, off = (rnd() + rnd() + rnd() - 1.5) * .16;
        d = bx.clone().multiplyScalar(Math.cos(a)).addScaledVector(by, Math.sin(a)).addScaledVector(band, off).normalize();
      } else d = new V3(rr(-1, 1), rr(-1, 1), rr(-1, 1)).normalize();
      if (d.y < -.04) d.y = -d.y;
      d.multiplyScalar(5200); pos.push(d.x, d.y, d.z);
      const big = rnd(); size.push(big > .985 ? rr(6, 8.5) : big > .9 ? rr(3.6, 5) : rr(2, 3.2)); ph.push(rnd() * 6.283);
      const c = new THREE.Color().setHSL(rnd() < .2 ? .08 : .6, rr(.1, .45), rr(.82, .97)); col.push(c.r, c.g, c.b);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aSize', new THREE.Float32BufferAttribute(size, 1));
    g.setAttribute('aPh', new THREE.Float32BufferAttribute(ph, 1)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const starMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, vertexColors: true,
      uniforms: { uTime: U.time, uPx: { value: Math.min(devicePixelRatio, 2) } },
      vertexShader: `attribute float aSize; attribute float aPh; uniform float uTime, uPx; varying vec3 vC; varying float vA;
        void main(){ vC = color; vA = .65 + .35 * sin(uTime * (1.3 + fract(aPh) * 2.) + aPh * 7.);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); gl_PointSize = aSize * uPx; }`,
      fragmentShader: `varying vec3 vC; varying float vA;
        void main(){ float d = length(gl_PointCoord - .5); float a = smoothstep(.5, .0, d); gl_FragColor = vec4(vC * a * vA * 2.2, a * vA); }`,
    });
    const stars = new THREE.Points(g, starMat); stars.frustumCulled = false; stars.renderOrder = -2; night.add(stars);
    // soft glow of the galactic band
    for (let i = 0; i < 44; i++) {
      const a = i / 44 * 6.283, d = bx.clone().multiplyScalar(Math.cos(a)).addScaledVector(by, Math.sin(a));
      if (d.y < .05) continue;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloud, color: 0x7a8cc0, transparent: true, opacity: .16, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
      s.position.copy(d.multiplyScalar(5000)); s.scale.set(2000, 760, 1); s.material.rotation = a; s.renderOrder = -3; night.add(s);
    }
    const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: soft, color: 0xe9efff, transparent: true, depthWrite: false, fog: false }));
    const moonDir = new V3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 32), THREE.MathUtils.degToRad(120));
    moon.position.copy(moonDir).multiplyScalar(5000); moon.scale.setScalar(260); night.add(moon);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: soft, color: 0x7f93c9, transparent: true, opacity: .35, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
    halo.position.copy(moon.position); halo.scale.setScalar(1300); night.add(halo);
    night.userData.moonDir = moonDir;
  }
  const dayFog = scene.fog.color.clone(), dayDensity = scene.fog.density;
  let isNight = false, envMats = null;
  function setNight(on) {
    if (on === isNight) return; isNight = on;
    if (!envMats) { envMats = []; scene.traverse(o => [].concat(o.material || []).forEach(m => { if (m.isMeshStandardMaterial && !envMats.includes(m)) envMats.push(m); })); envMats.forEach(m => m.userData.env = m.envMapIntensity); }
    envMats.forEach(m => m.envMapIntensity = on ? m.userData.env * .06 : m.userData.env);
    sky.visible = !on; night.visible = on;
    scene.background = on ? new THREE.Color(0x050916) : null;
    scene.fog.color.copy(on ? new THREE.Color(0x070d1c) : dayFog); scene.fog.density = on ? .0016 : dayDensity;
    sun.color.set(on ? 0x8ea6e8 : 0xffe0b5); sun.intensity = on ? .32 : 3.1;
    hemi.color.set(on ? 0x2a3a66 : 0xcfe0ff); hemi.groundColor.set(on ? 0x0b0d10 : 0x3a3a22); hemi.intensity = on ? .35 : .55;
    clouds.forEach(c => c.visible = !on); mists.forEach(m => m.visible = !on);
    birds.forEach(b => b.visible = !on); butterflies.forEach(b => b.visible = !on);
    homeGlass.emissiveIntensity = on ? 2.4 : .35;
  }

  console.info('[world] pool', POOL_H.toFixed(1), 'top', TOP_Y.toFixed(1), 'home', HOME_Y.toFixed(1), 'route m', routeLen,
    'trees', forestTrees.length, 'tea', teaLists.reduce((a, l) => a + l.length, 0), 'grass', gLists.reduce((a, l) => a + l.length, 0));

  const fallsFocus = new V3(CLIFF_X - 1, POOL_H + FALL_H * .45, POOL.z);
  return {
    setNight, route, heightAt, roadEnd, POOL_H, TOP_Y, fallsFocus, poolCenter: new V3(POOL.x, POOL_H, POOL.z),
    homeCenter: new V3(HOME_C.x, HOME_Y, HOME_C.z),
    groundCenter: new V3(GROUND_C.x, heightAt(GROUND_C.x, GROUND_C.z), GROUND_C.z),
    // 0..1 loudness of running water near a point (stream bed, and the falls themselves)
    waterAt(p) {
      const d = rDist(p.x, p.z);
      return { stream: 1 - smoothstep(8, 60, d), falls: 1 - smoothstep(25, 190, Math.hypot(p.x - CLIFF_X, p.z - POOL.z)) };
    },
    update(t, dt, focus) {
      U.time.value = t;
      fallMat.uniforms.uTime.value = t;
      waterN.offset.y -= dt * .22; waterN.offset.x = Math.sin(t * .1) * .05;
      foam.rotation.y = t * .1; foam.material.opacity = .65 + Math.sin(t * 2.3) * .12;
      spray.forEach(s => {
        const k = (t * .16 + s.userData.ph) % 1;
        s.position.set(CLIFF_X - 4 + s.userData.x * (1 + k), POOL_H + k * 16, POOL.z + s.userData.z * (1 + k * .8));
        s.scale.setScalar(3 + k * 13); s.material.opacity = Math.sin(k * Math.PI) * .35;
      });
      mists.forEach(m => {
        m.position.x = m.userData.base.x + Math.sin(t * .03 + m.userData.vx * 5) * 30;
        m.material.opacity = m.userData.op * smoothstep(m.scale.x * .45, m.scale.x * 1.1, m.position.distanceTo(focus)); // don't fog up the close-up shots
      });
      birds.forEach(b => {
        const u = b.userData, a = t * u.sp + u.off;
        b.position.set(u.cx + Math.cos(a) * (u.rad + u.dr), u.hgt + u.dy + Math.sin(t * .5 + u.ph) * 2, u.cz + Math.sin(a) * (u.rad + u.dr));
        b.rotation.y = -a - (u.sp > 0 ? 0 : Math.PI);
        const fl = Math.sin(t * 9 + u.ph) * .55; u.L.rotation.z = fl; u.R.rotation.z = -fl;
      });
      butterflies.forEach(b => {
        const u = b.userData, k = t * u.sp + u.ph;
        b.position.set(u.home.x + Math.sin(k) * 2.2 + Math.sin(k * 2.3) * .6, u.home.y + Math.sin(k * 3.1) * .4, u.home.z + Math.cos(k * .8) * 2.2);
        b.rotation.y = k; const fl = Math.sin(t * 24 + u.ph) * 1.1; u.L.rotation.z = fl; u.R.rotation.z = -fl;
      });
      sun.position.copy(focus).addScaledVector(isNight ? night.userData.moonDir : sunDir, 260); sun.target.position.copy(focus);
    },
  };
}

function hipRoof(L, W, eaveY, rise, mat) {
  const hl = L / 2, hw = W / 2, rl = Math.max(.5, hl - hw), top = eaveY + rise;
  const e = [[-hl, -hw], [hl, -hw], [hl, hw], [-hl, hw]].map(([x, z]) => new V3(x, eaveY, z));
  const r1 = new V3(-rl, top, 0), r2 = new V3(rl, top, 0);
  const faces = [[e[3], e[2], r2, r1], [e[1], e[0], r1, r2], [e[0], e[3], r1], [e[2], e[1], r2]];
  const pos = [], uv = [];
  faces.forEach(f => {
    const a = f[0], b = f[1], tan = b.clone().sub(a).normalize();
    const n = b.clone().sub(a).cross(f[2].clone().sub(a)).normalize(), up = n.clone().cross(tan).normalize();
    const tris = f.length === 4 ? [[0, 1, 2], [0, 2, 3]] : [[0, 1, 2]];
    tris.forEach(t => t.forEach(k => { const p = f[k], d = p.clone().sub(a); pos.push(p.x, p.y, p.z); uv.push(d.dot(tan) / 2.4, d.dot(up) / 1.8); }));
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat); m.castShadow = m.receiveShadow = true;
  return m;
}

function buildHomestay(scene, C, y, faceTo, barkTex, detail) {
  const roofT = roofTexCache || (roofTexCache = TX.roofTex());
  const roofMat = new THREE.MeshStandardMaterial({ map: roofT, roughness: .8, side: THREE.DoubleSide });
  const wall = new THREE.MeshStandardMaterial({ color: 0xece2cc, map: detail, roughness: .9 });
  const oxide = new THREE.MeshStandardMaterial({ color: 0x7a3022, roughness: .55 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x5b3a22, map: barkTex, roughness: .7 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1b1a16, emissive: 0xffb15e, emissiveIntensity: .35, roughness: .3 });
  const box = (w, h, d, mat, x, yy, z, parent) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, yy, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m; };

  function house(L, W, parent) {
    const g = new THREE.Group();
    box(L + 1.5, .7, W + 3, oxide, 0, .35, .8, g);                       // plinth + veranda floor
    box(L, 3.2, W, wall, 0, 2.3, 0, g);                                  // walls
    for (let x = -L / 2 + .3; x <= L / 2 - .3 + 1e-3; x += (L - .6) / Math.round(L / 2.3)) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(.12, .14, 3.1, 10), wood); p.position.set(x, 2.25, W / 2 + 1.9); p.castShadow = true; g.add(p);
    }
    box(L + .4, .22, .22, wood, 0, 3.85, W / 2 + 1.9, g);                // veranda beam
    for (const x of [-L / 2 + 1.8, L / 2 - 1.8]) { box(1.4, 1.5, .14, wood, x, 2.4, W / 2 + .03, g); box(1.1, 1.2, .16, glass, x, 2.4, W / 2 + .04, g); }
    box(1.3, 2.4, .14, wood, 0, 1.9, W / 2 + .03, g);
    for (const s of [-1, 1]) { box(.14, 1.4, 1.3, wood, s * (L / 2 + .03), 2.4, -.5, g); box(.16, 1.1, 1.0, glass, s * (L / 2 + .04), 2.4, -.5, g); }
    box(2.4, .35, .9, oxide, 0, .17, W / 2 + 3.2, g);                    // front step
    const roof = hipRoof(L + 2.2, W + 4.4, 3.95, 3.1, roofMat); roof.position.z = .9; g.add(roof);
    parent.add(g); return g;
  }
  const site = new THREE.Group();
  site.position.set(C.x, y, C.z);
  site.rotation.y = Math.atan2(faceTo.x - C.x, faceTo.z - C.z);
  house(13, 8, site);
  const cottage = house(7, 5.5, site); cottage.position.set(-14, 0, -7); cottage.rotation.y = .5;
  const katte = box(1, 1, 1, wall, 0, .5, 10, site);                    // tulasi katte in the yard
  const tulasi = new THREE.Mesh(new THREE.IcosahedronGeometry(.45, 1), new THREE.MeshStandardMaterial({ color: 0x3f6b25, roughness: .9 }));
  tulasi.position.set(0, 1.35, 10); site.add(tulasi); katte.castShadow = true;
  scene.add(site);
  return glass;
}
let roofTexCache = null;
