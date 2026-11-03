// Procedurally painted textures (canvas) — leaves, bark, soil, roof tiles, water normals, mist.
import * as THREE from 'three';
import { mulberry32 } from './noise.js';

const r = mulberry32(42);
const rr = (a, b) => a + (b - a) * r();
const pick = a => a[Math.floor(r() * a.length)];

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function tex(c, { srgb = true, repeat = false, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  return t;
}

function leaf(g, len, wid, color, rib) {
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(0, 0);
  g.quadraticCurveTo(len * .45, -len * wid, len, 0);
  g.quadraticCurveTo(len * .45, len * wid, 0, 0);
  g.fill();
  if (rib) { g.strokeStyle = rib; g.lineWidth = Math.max(.6, len * .03); g.beginPath(); g.moveTo(0, 0); g.lineTo(len * .85, 0); g.stroke(); }
}

// 2x2 atlas of foliage clusters: 0 broad evergreen, 1 fresh/light, 2 narrow (bamboo), 3 feathery (silver oak)
export function leafAtlas() {
  const S = 1024, [c, g] = canvas(S);
  const V = [
    { h: [96, 128], s: [30, 52], l: [12, 30], n: 190, len: [26, 44], wid: [.32, .46] },
    { h: [72, 104], s: [40, 62], l: [20, 40], n: 180, len: [22, 38], wid: [.36, .52] },
    { h: [80, 108], s: [30, 50], l: [18, 36], n: 260, len: [34, 56], wid: [.08, .14] },
    { h: [62, 92], s: [12, 28], l: [24, 44], n: 360, len: [16, 26], wid: [.12, .2] },
  ];
  V.forEach((v, k) => {
    const ox = (k % 2) * 512 + 256, oy = Math.floor(k / 2) * 512 + 256;
    g.save();
    g.beginPath(); g.rect(ox - 256, oy - 256, 512, 512); g.clip();
    // dense core so clusters don't look see-through
    g.fillStyle = `hsl(${v.h[0] + 8},${v.s[0]}%,${v.l[0] - 2}%)`;
    g.beginPath();
    for (let a = 0; a <= 24; a++) {
      const t = a / 24 * Math.PI * 2, rad = 120 + Math.sin(t * 5 + k) * 22 + rr(-14, 14);
      g.lineTo(ox + Math.cos(t) * rad, oy + Math.sin(t) * rad);
    }
    g.fill();
    // twigs
    g.strokeStyle = 'rgba(70,52,34,.9)';
    for (let i = 0; i < 9; i++) {
      const a = r() * 6.283; g.lineWidth = rr(1.5, 3.5);
      g.beginPath(); g.moveTo(ox, oy); g.lineTo(ox + Math.cos(a) * rr(120, 200), oy + Math.sin(a) * rr(120, 200)); g.stroke();
    }
    const leaves = [];
    for (let i = 0; i < v.n; i++) {
      const a = r() * 6.283, rad = Math.sqrt(r()) * 205;
      leaves.push({ a, rad, depth: r() });
    }
    leaves.sort((p, q) => p.depth - q.depth);
    for (const L of leaves) {
      g.save();
      g.translate(ox + Math.cos(L.a) * L.rad, oy + Math.sin(L.a) * L.rad);
      g.rotate(L.a + rr(-.9, .9));
      const lit = rr(v.l[0], v.l[1]) * (.75 + L.depth * .45);
      const col = `hsl(${rr(v.h[0], v.h[1])},${rr(v.s[0], v.s[1])}%,${lit}%)`;
      leaf(g, rr(v.len[0], v.len[1]) * (1.25 - L.rad / 205 * .4), rr(v.wid[0], v.wid[1]), col, `hsla(${v.h[0]},30%,${lit + 14}%,.55)`);
      g.restore();
    }
    g.restore();
  });
  const t = tex(c);
  t.generateMipmaps = true;
  return t;
}

// Small dense leaves for clipped tea hedges (opaque, tiling).
export function teaTex() {
  const S = 256, [c, g] = canvas(S);
  g.fillStyle = '#16300f'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 900; i++) {
    const x = r() * S, y = r() * S, len = rr(9, 17);
    for (const [dx, dy] of [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S]]) {
      g.save(); g.translate(x + dx, y + dy); g.rotate(r() * 6.283);
      leaf(g, len, .42, `hsl(${rr(78, 104)},${rr(45, 70)}%,${rr(18, 42)}%)`, 'rgba(190,220,140,.35)');
      g.restore();
    }
  }
  return tex(c, { repeat: true });
}

// Palm frond: pinnate leaflets along a midrib, drawn vertically (v = along frond).
export function frondTex() {
  const W = 128, H = 512, [c, g] = canvas(W, H);
  g.lineCap = 'round';
  for (let y = 6; y < H - 4; y += 5) {
    const t = y / H, len = Math.sin(Math.PI * Math.min(1, t * 1.15)) * 60 + 4;
    for (const side of [-1, 1]) {
      g.strokeStyle = `hsl(${rr(78, 98)},${rr(40, 58)}%,${rr(22, 36)}%)`;
      g.lineWidth = rr(2.5, 4);
      g.beginPath(); g.moveTo(64, y); g.quadraticCurveTo(64 + side * len * .6, y + 4, 64 + side * len, y + len * .45); g.stroke();
    }
  }
  g.strokeStyle = '#8c8a4a'; g.lineWidth = 3; g.beginPath(); g.moveTo(64, 0); g.lineTo(64, H); g.stroke();
  return tex(c);
}

export function fernTex() {
  const W = 128, H = 256, [c, g] = canvas(W, H);
  for (let y = 4; y < H - 2; y += 6) {
    const t = y / H, len = Math.sin(Math.PI * t) * 54 * (1 - t * .35) + 3;
    for (const side of [-1, 1]) {
      g.fillStyle = `hsl(${rr(92, 112)},${rr(45, 60)}%,${rr(18, 34)}%)`;
      g.save(); g.translate(64, y); g.rotate(side * (1.2 - t * .3));
      for (let k = 0; k < len; k += 4) { g.beginPath(); g.ellipse(k, 0, 3, 2.2, 0, 0, 6.3); g.fill(); }
      g.restore();
    }
  }
  g.strokeStyle = '#3d4a22'; g.lineWidth = 2; g.beginPath(); g.moveTo(64, 0); g.lineTo(64, H); g.stroke();
  return tex(c);
}

export function bananaTex() {
  const W = 128, H = 512, [c, g] = canvas(W, H);
  const grd = g.createLinearGradient(0, 0, W, 0);
  grd.addColorStop(0, '#3f6a1c'); grd.addColorStop(.5, '#5c8a2a'); grd.addColorStop(1, '#355a17');
  g.fillStyle = grd;
  g.beginPath(); g.moveTo(64, 0);
  g.bezierCurveTo(130, 60, 128, 420, 64, H); g.bezierCurveTo(0, 420, -2, 60, 64, 0); g.fill();
  g.strokeStyle = 'rgba(35,60,15,.45)'; g.lineWidth = 1;
  for (let y = 10; y < H; y += 7) { g.beginPath(); g.moveTo(64, y); g.lineTo(2, y + 22); g.moveTo(64, y); g.lineTo(126, y + 22); g.stroke(); }
  g.globalCompositeOperation = 'destination-out'; g.lineWidth = 2.2;
  for (let i = 0; i < 9; i++) { const y = rr(60, 470), s = pick([-1, 1]); g.beginPath(); g.moveTo(64 + s * rr(8, 30), y); g.lineTo(64 + s * 70, y + 20); g.stroke(); }
  g.globalCompositeOperation = 'source-over';
  g.strokeStyle = '#b5c070'; g.lineWidth = 4; g.beginPath(); g.moveTo(64, 0); g.lineTo(64, H); g.stroke();
  return tex(c);
}

export function barkTex() {
  const S = 256, [c, g] = canvas(S);
  g.fillStyle = '#4b4136'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 260; i++) {
    const x = r() * S, w = rr(1, 5);
    g.strokeStyle = r() < .5 ? `rgba(30,24,18,${rr(.2, .6)})` : `rgba(140,128,108,${rr(.1, .35)})`;
    g.lineWidth = w;
    g.beginPath(); g.moveTo(x, 0);
    for (let y = 0; y <= S; y += 16) g.lineTo(x + Math.sin(y * .05 + i) * 3, y);
    g.stroke();
  }
  for (let i = 0; i < 70; i++) { // lichen + moss blotches
    g.fillStyle = r() < .5 ? `rgba(150,160,130,${rr(.15, .35)})` : `rgba(70,95,40,${rr(.2, .45)})`;
    const x = r() * S, y = r() * S, s = rr(4, 16);
    for (const dx of [-S, 0, S]) { g.beginPath(); g.ellipse(x + dx, y, s, s * rr(.6, 1.4), 0, 0, 6.3); g.fill(); }
  }
  return tex(c, { repeat: true });
}

// Mid-grey speckle used to break up flat vertex colours (multiplied).
export function detailTex() {
  const S = 512, [c, g] = canvas(S);
  g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 6000; i++) {
    const x = r() * S, y = r() * S, s = rr(1, 6) * (r() < .05 ? 4 : 1);
    const v = Math.round(rr(150, 255));
    g.fillStyle = `rgba(${v},${v},${v},${rr(.15, .5)})`;
    for (const [dx, dy] of [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S]]) { g.beginPath(); g.arc(x + dx, y + dy, s, 0, 6.3); g.fill(); }
  }
  return tex(c, { repeat: true, srgb: false });
}

// Red laterite trail soil with feathered edges (u = across, v = along).
export function trailTex() {
  const W = 128, H = 256, [c, g] = canvas(W, H);
  g.fillStyle = '#7a4630'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 1400; i++) {
    const x = r() * W, y = r() * H, s = rr(.6, 3.2);
    g.fillStyle = pick(['rgba(150,92,60,.6)', 'rgba(60,34,22,.55)', 'rgba(175,150,120,.5)', 'rgba(95,60,40,.6)']);
    for (const dy of [-H, 0, H]) { g.beginPath(); g.arc(x, y + dy, s, 0, 6.3); g.fill(); }
  }
  for (const x of [38, 90]) { // foot-worn ruts
    g.strokeStyle = 'rgba(55,30,18,.35)'; g.lineWidth = 10;
    g.beginPath(); g.moveTo(x, 0); for (let y = 0; y <= H; y += 32) g.lineTo(x + Math.sin(y / H * 6.283) * 4, y); g.stroke();
  }
  const d = g.getImageData(0, 0, W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = Math.abs(x / (W - 1) - .5) * 2;
    const a = 1 - Math.min(1, Math.max(0, (u - .55 - Math.sin(y * .21 + x * .05) * .08) / .4));
    d.data[(y * W + x) * 4 + 3] = a * 255;
  }
  g.putImageData(d, 0, 0);
  return tex(c, { repeat: true });
}

// Mangalore clay roof tiles.
export function roofTex() {
  const S = 256, [c, g] = canvas(S);
  g.fillStyle = '#6e2a19'; g.fillRect(0, 0, S, S);
  const rows = 8, cols = 6, rh = S / rows, cw = S / cols;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const x = i * cw + (j % 2) * cw / 2, y = j * rh;
    for (const dx of [-S, 0, S]) {
      const grd = g.createLinearGradient(x + dx, 0, x + dx + cw, 0);
      const base = rr(38, 50);
      grd.addColorStop(0, `hsl(14,52%,${base - 12}%)`); grd.addColorStop(.5, `hsl(16,58%,${base}%)`); grd.addColorStop(1, `hsl(13,50%,${base - 16}%)`);
      g.fillStyle = grd;
      g.beginPath(); g.moveTo(x + dx + 2, y); g.lineTo(x + dx + cw - 2, y);
      g.lineTo(x + dx + cw - 2, y + rh * .8); g.quadraticCurveTo(x + dx + cw / 2, y + rh * 1.12, x + dx + 2, y + rh * .8); g.fill();
    }
  }
  g.fillStyle = 'rgba(30,30,20,.18)';
  for (let i = 0; i < 300; i++) { g.beginPath(); g.arc(r() * S, r() * S, rr(1, 6), 0, 6.3); g.fill(); }
  return tex(c, { repeat: true });
}

// Tileable water normal map built from integer-frequency sine waves.
export function waterNormalTex() {
  const S = 256, [c, g] = canvas(S), img = g.createImageData(S, S);
  const waves = Array.from({ length: 14 }, () => ({ kx: Math.round(rr(-9, 9)), ky: Math.round(rr(2, 14)), a: rr(.3, 1), p: r() * 6.283 }));
  const h = (x, y) => waves.reduce((s, w) => s + w.a * Math.sin(6.283 * (w.kx * x + w.ky * y) / S + w.p), 0);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (h(x + 1, y) - h(x - 1, y)) * .9, dy = (h(x, y + 1) - h(x, y - 1)) * .9;
    const l = Math.hypot(dx, dy, 1), i = (y * S + x) * 4;
    img.data[i] = (-dx / l * .5 + .5) * 255; img.data[i + 1] = (-dy / l * .5 + .5) * 255; img.data[i + 2] = (1 / l * .5 + .5) * 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return tex(c, { repeat: true, srgb: false });
}

export function softTex() {
  const S = 128, [c, g] = canvas(S);
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(.4, 'rgba(255,255,255,.45)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, S, S);
  return tex(c);
}

export function cloudTex() {
  const S = 256, [c, g] = canvas(S);
  for (let i = 0; i < 26; i++) {
    const x = rr(60, 196), y = rr(90, 170), rad = rr(30, 70);
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, 'rgba(255,255,255,.35)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, S, S);
  }
  return tex(c);
}

export function butterflyTex() {
  const [c, g] = canvas(64);
  g.fillStyle = '#0d0f14';
  g.beginPath(); g.moveTo(2, 32); g.bezierCurveTo(10, 2, 60, 0, 62, 20); g.bezierCurveTo(60, 34, 30, 36, 2, 32); g.fill();
  g.beginPath(); g.moveTo(2, 32); g.bezierCurveTo(20, 40, 50, 46, 44, 62); g.bezierCurveTo(30, 62, 8, 48, 2, 32); g.fill();
  g.fillStyle = '#4fb4ff';
  g.beginPath(); g.ellipse(36, 22, 14, 6, -.3, 0, 6.3); g.fill();
  g.beginPath(); g.ellipse(26, 44, 9, 5, .6, 0, 6.3); g.fill();
  g.fillStyle = '#ffffff'; for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(rr(40, 60), rr(8, 28), 1.4, 0, 6.3); g.fill(); }
  return tex(c);
}
