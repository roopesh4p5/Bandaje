// Finds the photos/videos you drop into "photos and video/…" and shows them as holograms.
const DIRS = { flora: 'photos and video/flora founa/', memories: 'photos and video/memories/' };
const IMG = /\.(jpe?g|png|webp|gif|avif)$/i, VID = /\.(mp4|webm|mov|m4v)$/i;
const FAUNA_WORDS = /(bird|butterfl|moth|squirrel|monkey|langur|macaque|snake|frog|toad|lizard|gecko|insect|beetle|spider|deer|gaur|bison|hornbill|thrush|peafowl|peacock|eagle|owl|crab|leech|ant|bee|wasp|dragonfl|minivet|fauna|animal|cricket|caterpillar|skink|boar|civet)/i;

// 1) Read the folder's directory listing (works with `python -m http.server`, VS Code Live Server…)
// 2) else fall back to media.json  ({"flora":[…], "memories":[…]}) — run make_media_list.py to refresh it.
async function listDir(dir) {
  try {
    const res = await fetch(encodeURI(dir), { cache: 'no-store' });
    if (!res.ok) return null;
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const names = [...doc.querySelectorAll('a[href]')]
      .map(a => decodeURIComponent((a.getAttribute('href') || '').split(/[?#]/)[0].split('/').filter(Boolean).pop() || ''))
      .filter(n => IMG.test(n) || VID.test(n));
    return names.length ? [...new Set(names)] : null;
  } catch { return null; }
}

// Where a file goes in the story, from captions.json first, else from words in its name.
const MEM_STAGE = [[/(camp\s*fire|bonfire|night|stargaz|stars?\b)/i, 'camp'], [/(sunrise|homestay|morning|breakfast)/i, 'home'], [/(jeep|jepp|truck|ride|pickup)/i, 'drive'],
  [/(waterfall|falls|final|destination)/i, 'falls'], [/(tea|estate)/i, 'tea'], [/(view|trek|treck|forest|trail|climb|ridge|summit)/i, 'trek']];
const SPECIES_STAGE = [[/(waterfall|falls|trek|treck|forest|trail)/i, 'trek'], [/(tea|estate)/i, 'tea']];

function describe(dir, file, isFlora, caps) {
  const base = file.replace(/\.[^.]+$/, '');
  const cap = caps[file] || {};
  const kind = cap.kind || (isFlora ? (/^fauna/i.test(base) ? 'FAUNA' : /^flora/i.test(base) ? 'FLORA' : FAUNA_WORDS.test(base) ? 'FAUNA' : 'FLORA') : 'MEMORY');
  const label = cap.label || base.replace(/^\d+[\s._-]*/, '').replace(/^(flora|fauna)[\s._-]*/i, '').replace(/[_-]+/g, ' ').trim().toUpperCase() || kind;
  const stage = cap.stage || ((isFlora ? SPECIES_STAGE : MEM_STAGE).find(([re]) => re.test(base)) || [0, isFlora ? null : 'tea'])[1];
  return { src: encodeURI(dir + file), file, kind, label, stage, order: cap.order ?? 999, video: VID.test(file) };
}

// Extra media referenced directly by the story (selfies, tea estate, games clip).
export async function loadExtra(list) {
  const out = list.map(x => ({ file: x.src, kind: 'MEMORY', order: 0, ...x, src: encodeURI(x.src), video: VID.test(x.src) }));
  await Promise.all(out.map(preload));
  return out.filter(m => !m.broken);
}

export async function loadMedia() {
  let flora = await listDir(DIRS.flora), memories = await listDir(DIRS.memories);
  if (!flora || !memories) {
    try {
      const j = await (await fetch('media.json', { cache: 'no-store' })).json();
      flora = flora || j.flora || []; memories = memories || j.memories || [];
    } catch { flora = flora || []; memories = memories || []; }
  }
  let caps = { flora: {}, memories: {} };
  try { caps = Object.assign(caps, await (await fetch('captions.json', { cache: 'no-store' })).json()); } catch { /* optional */ }
  const byOrder = (x, y) => x.order - y.order || x.file.localeCompare(y.file, undefined, { numeric: true });
  const F = flora.map(f => describe(DIRS.flora, f, true, caps.flora || {}));
  const M = memories.map(f => describe(DIRS.memories, f, false, caps.memories || {}));
  await Promise.all([...F, ...M].map(preload));
  // species without a stage are shared out to balance the tea estate and the forest
  const tea = F.filter(m => m.stage === 'tea' && !m.broken), trek = F.filter(m => m.stage === 'trek' && !m.broken);
  F.filter(m => !m.stage && !m.broken).sort(byOrder).forEach(m => (tea.length <= trek.length ? tea : trek).push(m));
  tea.sort(byOrder); trek.sort(byOrder);
  [...tea, ...trek].forEach((m, i) => m.index = i + 1);
  const mem = {};
  for (const k of ['home', 'drive', 'tea', 'camp', 'trek', 'falls']) mem[k] = M.filter(m => m.stage === k && !m.broken).sort(byOrder);
  ['home', 'drive', 'tea', 'camp', 'trek', 'falls'].flatMap(k => mem[k]).forEach((m, i) => m.index = i + 1);
  return { species: { tea, trek }, memories: mem, total: { species: tea.length + trek.length, memories: Object.values(mem).reduce((a, l) => a + l.length, 0) } };
}

function preload(m) {
  return new Promise(done => {
    if (m.video) {
      const v = document.createElement('video');
      Object.assign(v, { muted: true, playsInline: true, loop: true, preload: 'auto', src: m.src });
      v.setAttribute('playsinline', '');
      v.onloadedmetadata = () => { m.duration = v.duration; done(); };
      v.onerror = () => { m.broken = true; done(); };
      m.el = v;
    } else {
      const img = new Image(); img.decoding = 'async'; img.src = m.src;
      img.onload = () => done(); img.onerror = () => { m.broken = true; done(); };
      m.el = img;
    }
    setTimeout(done, 8000);
  });
}

// Split n items into groups of 3 (and 2), never leaving a lonely single.
export function groupsOf(items) {
  const out = [], a = items.filter(m => !m.broken);
  let i = 0;
  while (i < a.length) { const left = a.length - i, n = left === 4 ? 2 : Math.min(3, left); out.push(a.slice(i, i + n)); i += n; }
  return out;
}

// ---- hologram DOM ----
const layer = document.getElementById('holo');
const beam = document.getElementById('holoBeam');
let current = [];

function card(m, total, i, big, dur) {
  const el = document.createElement('div');
  el.className = `holo-card ${m.kind.toLowerCase()}${big ? ' big' : ''}`;
  el.style.setProperty('--i', i);
  el.style.setProperty('--dur', `${dur}s`);
  el.style.setProperty('--px', `${(Math.random() - .5) * 8}%`);
  el.style.setProperty('--py', `${(Math.random() - .5) * 8}%`);
  const media = document.createElement('div'); media.className = 'holo-media';
  const node = m.el.cloneNode(true);
  if (m.video) { node.muted = true; node.playsInline = true; node.loop = true; node.currentTime = 0; node.play().catch(() => {}); }
  media.append(node, Object.assign(document.createElement('i'), { className: 'holo-scan' }));
  const meta = document.createElement('div'); meta.className = 'holo-meta';
  const tag = m.kind === 'MEMORY' ? `MEMORY ${String(m.index).padStart(2, '0')} / ${String(total).padStart(2, '0')}` : `${m.kind} DETECTED · ${String(m.index).padStart(2, '0')}/${String(total).padStart(2, '0')}`;
  meta.innerHTML = `<small>${tag}</small><b></b>`;
  meta.querySelector('b').textContent = m.label;
  el.append(Object.assign(document.createElement('span'), { className: 'holo-corners' }), media, meta);
  return el;
}

export function showHolo(items, total, big = false, dur = 4, layout = '') {
  hideHolo(true);
  layer.className = `holo ${layout || 'n' + items.length}${big ? ' big' : ''}`;
  current = items.map((m, i) => card(m, total, i, big, dur));
  layer.replaceChildren(...current);
  requestAnimationFrame(() => { layer.classList.add('on'); beam.classList.add('on'); });
}

export function hideHolo(instant) {
  if (!current.length) return;
  const old = current; current = [];
  layer.classList.remove('on'); beam.classList.remove('on');
  old.forEach(c => c.classList.add('out'));
  const clear = () => old.forEach(c => { c.querySelector('video')?.pause(); c.remove(); });
  instant ? clear() : setTimeout(clear, 450);
}

// Keep the projector beam pinned between the trekker (screen point) and the cards.
export function placeBeam(x, y, visible) {
  const top = layer.getBoundingClientRect(), host = layer.parentElement.getBoundingClientRect();
  const yTop = top.bottom - host.top;
  beam.style.left = `${x}px`;
  beam.style.top = `${Math.min(yTop, y)}px`;
  beam.style.height = `${Math.max(0, y - yTop)}px`;
  beam.style.opacity = visible ? '' : '0';
}
