// Deterministic noise + math helpers so the world is identical on every loop / recording.

export function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const GRAD = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
const perm = new Uint8Array(512);
{
  const r = mulberry32(1337), p = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
}
const F2 = .5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;

// 2D simplex noise, roughly in [-1, 1].
export function noise2(x, y) {
  const s = (x + y) * F2, i = Math.floor(x + s), j = Math.floor(y + s);
  const t = (i + j) * G2, x0 = x - (i - t), y0 = y - (j - t);
  const i1 = x0 > y0 ? 1 : 0, j1 = 1 - i1;
  const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2, x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
  const ii = i & 255, jj = j & 255;
  let n = 0, c;
  c = .5 - x0 * x0 - y0 * y0; if (c > 0) { const g = GRAD[perm[ii + perm[jj]] & 7]; c *= c; n += c * c * (g[0] * x0 + g[1] * y0); }
  c = .5 - x1 * x1 - y1 * y1; if (c > 0) { const g = GRAD[perm[ii + i1 + perm[jj + j1]] & 7]; c *= c; n += c * c * (g[0] * x1 + g[1] * y1); }
  c = .5 - x2 * x2 - y2 * y2; if (c > 0) { const g = GRAD[perm[ii + 1 + perm[jj + 1]] & 7]; c *= c; n += c * c * (g[0] * x2 + g[1] * y2); }
  return 70 * n;
}

export function fbm(x, y, oct = 5) {
  let a = 1, f = 1, s = 0, n = 0;
  for (let i = 0; i < oct; i++) { s += a * noise2(x * f + i * 19.1, y * f - i * 7.3); n += a; a *= .5; f *= 2.03; }
  return s / n;
}

export function ridged(x, y, oct = 4) {
  let a = 1, f = 1, s = 0, n = 0;
  for (let i = 0; i < oct; i++) { const v = 1 - Math.abs(noise2(x * f + 31.7 * i, y * f - 17.3 * i)); s += a * v * v; n += a; a *= .5; f *= 2.1; }
  return s / n;
}

export const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
export const mix = (a, b, t) => a + (b - a) * t;
export function smoothstep(e0, e1, x) { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); }
