// Generated soundtrack (Web Audio, no files): an original Bollywood-style travel song — sitar hook,
// dholak keherwa groove, ghungroo, harmonium, tanpura drone, bass and bansuri — plus forest
// ambience: birds, cicadas, wind, the stream/waterfall and the pickup's engine.
// It's composed here, so it's copyright-free. Drop your own track at music/theme.mp3 to replace the score.

const BPM = 96, STEP = 60 / BPM / 4;
const midi = n => 440 * 2 ** ((n - 69) / 12);
const NOTE = { D4: 62, E4: 64, 'F#4': 66, G4: 67, A4: 69, B4: 71, 'C#5': 73, D5: 74, E5: 76, 'F#5': 78, G5: 79, A5: 81 };

// one chord per bar: D | G | A | D | Bm | G | A | D
const PROG = [
  { h: [62, 66, 69], b: 38 }, { h: [62, 67, 71], b: 43 }, { h: [61, 64, 69], b: 45 }, { h: [62, 66, 69], b: 38 },
  { h: [62, 66, 71], b: 47 }, { h: [62, 67, 71], b: 43 }, { h: [61, 64, 69], b: 45 }, { h: [62, 66, 69], b: 38 },
];
// the hook, on an 8th-note grid ('-' holds, '.' rests)
const HOOK = [
  'F#4 A4 B4 A4 F#4 - E4 D4', 'G4 - B4 - D5 - B4 A4', 'A4 - C#5 - E5 D5 C#5 B4', 'A4 - - - . F#4 G4 A4',
  'B4 - D5 - F#5 E5 D5 C#5', 'D5 - B4 - G4 A4 B4 D5', 'E5 - D5 C#5 B4 - A4 G4', 'F#4 - E4 - D4 - - .',
].map(bar => bar.split(' '));
const SCALE = [62, 64, 66, 69, 71, 74, 76, 78, 81]; // D major pentatonic for the bansuri

export function createSoundtrack() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const g = (v = 1) => { const n = ctx.createGain(); n.gain.value = v; return n; };

  const master = g(0), comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.ratio.value = 3.5; comp.attack.value = .005; comp.release.value = .2;
  master.connect(comp).connect(ctx.destination);
  let recDest = null; // tap for the video recorder

  const rev = ctx.createConvolver();
  {
    const len = ctx.sampleRate * 2.6, b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.8; }
    rev.buffer = b;
  }
  const revOut = g(.42); rev.connect(revOut).connect(master);
  const music = g(.85), nature = g(.8);
  music.connect(master); nature.connect(master);
  const send = g(1); send.connect(rev);
  const delay = ctx.createDelay(1.5), fb = g(.3), dlp = ctx.createBiquadFilter();
  delay.delayTime.value = STEP * 3; dlp.type = 'lowpass'; dlp.frequency.value = 2600;
  delay.connect(dlp).connect(fb).connect(delay); dlp.connect(music);

  const noiseBuf = (() => { const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; })();
  const noise = () => { const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; s.start(); return s; };
  const burst = (t, len) => { const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.start(t, Math.random() * 1.5); s.stop(t + len); return s; };
  const filt = (type, f, q = 1) => { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; return n; };
  const env = (node, t, peak, a, d) => { node.gain.setValueAtTime(0, t); node.gain.linearRampToValueAtTime(peak, t + a); node.gain.exponentialRampToValueAtTime(.0001, t + a + d); };

  // ---------------- ambience beds ----------------
  const water = g(0), waterHi = g(0);
  noise().connect(filt('lowpass', 700, .5)).connect(water).connect(nature);
  noise().connect(filt('bandpass', 2600, .4)).connect(waterHi).connect(nature);
  const wind = g(.02); noise().connect(filt('bandpass', 380, .6)).connect(wind).connect(nature);
  const cicada = g(0), cicAM = g(.5);
  noise().connect(filt('bandpass', 5400, 9)).connect(cicAM).connect(cicada).connect(nature);
  { const lfo = ctx.createOscillator(), d = g(.5); lfo.frequency.value = 14; lfo.connect(d).connect(cicAM.gain); lfo.start(); }
  const engine = g(0), eLP = filt('lowpass', 260, 2);
  const e1 = ctx.createOscillator(), e2 = ctx.createOscillator();
  e1.type = e2.type = 'sawtooth'; e1.frequency.value = 38; e2.frequency.value = 76.7;
  e1.connect(eLP); e2.connect(eLP); e1.start(); e2.start();
  noise().connect(filt('bandpass', 140, 3)).connect(g(.6)).connect(eLP);
  eLP.connect(engine).connect(nature);

  function chirp(t, pan) {
    const n = 2 + Math.floor(Math.random() * 5), base = 2200 + Math.random() * 2200, p = ctx.createStereoPanner();
    p.pan.value = pan; p.connect(nature); p.connect(send);
    for (let i = 0; i < n; i++) {
      const o = ctx.createOscillator(), a = g(0), t0 = t + i * (.09 + Math.random() * .06);
      o.frequency.setValueAtTime(base, t0); o.frequency.exponentialRampToValueAtTime(base * (1.2 + Math.random() * .5), t0 + .06);
      a.gain.setValueAtTime(0, t0); a.gain.linearRampToValueAtTime(.03, t0 + .01); a.gain.exponentialRampToValueAtTime(.0001, t0 + .08);
      o.connect(a).connect(p); o.start(t0); o.stop(t0 + .1);
    }
  }

  // ---------------- instruments ----------------
  const shaper = ctx.createWaveShaper();
  { const c = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; c[i] = Math.tanh(x * 3.2); } shaper.curve = c; }
  const sitarBus = g(.9), sitarPan = ctx.createStereoPanner(); sitarPan.pan.value = .12;
  const sp1 = filt('peaking', 2300, 3), sp2 = filt('peaking', 3600, 4); sp1.gain.value = 7; sp2.gain.value = 5;
  shaper.connect(sp1).connect(sp2).connect(filt('lowpass', 6500, .5)).connect(sitarBus).connect(sitarPan);
  sitarPan.connect(music); sitarPan.connect(send); sitarPan.connect(delay);

  let sitarFreq = midi(66);
  function sitar(n, t, dur, vel = 1) {
    const f = midi(n), from = Math.abs(Math.log2(f / sitarFreq)) < .3 ? sitarFreq : f * .944;  // meend from the last note, or a quick krintan slide
    const a = g(0), o = ctx.createOscillator(), o2 = ctx.createOscillator(), o2g = g(.45);
    o.type = 'sawtooth'; o2.type = 'square';
    [o, o2].forEach(x => { x.frequency.setValueAtTime(from, t); x.frequency.exponentialRampToValueAtTime(f, t + .055); });
    o2.detune.value = 5;
    o.connect(a); o2.connect(o2g).connect(a);
    a.gain.setValueAtTime(0, t); a.gain.linearRampToValueAtTime(.22 * vel, t + .004);
    a.gain.exponentialRampToValueAtTime(.06 * vel, t + .35); a.gain.exponentialRampToValueAtTime(.0005, t + Math.max(.5, dur) + .6);
    a.connect(shaper);
    [o, o2].forEach(x => { x.start(t); x.stop(t + dur + .7); });
    const ck = g(0); burst(t, .04).connect(filt('bandpass', 5200, 4)).connect(ck).connect(music); env(ck, t, .03 * vel, .001, .03); // chikari tick
    sitarFreq = f;
  }
  function harmonium(notes, t, dur, lvl) {
    const lp = filt('lowpass', 1500 + lvl * 1200, .7), a = g(0), trem = ctx.createOscillator(), td = g(.012);
    trem.frequency.value = 5.5; trem.connect(td).connect(a.gain); trem.start(t); trem.stop(t + dur + .5);
    lp.connect(a); a.connect(music); a.connect(send);
    a.gain.setValueAtTime(0, t); a.gain.linearRampToValueAtTime(.045 * lvl, t + .18);
    a.gain.setValueAtTime(.045 * lvl, t + dur - .05); a.gain.linearRampToValueAtTime(0, t + dur + .35);
    notes.forEach(n => [['square', -4], ['sawtooth', 4]].forEach(([type, dt]) => {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = midi(n); o.detune.value = dt; o.connect(lp); o.start(t); o.stop(t + dur + .4);
    }));
  }
  function tanpura(n, t) {
    const o = ctx.createOscillator(), bp = filt('bandpass', midi(n) * 6, 2), a = g(0), dry = g(.5);
    o.type = 'sawtooth'; o.frequency.value = midi(n);
    bp.frequency.setValueAtTime(midi(n) * 8, t); bp.frequency.exponentialRampToValueAtTime(midi(n) * 2.5, t + 2.4); // jawari shimmer
    o.connect(bp).connect(a); o.connect(filt('lowpass', 500)).connect(dry).connect(a);
    a.gain.setValueAtTime(0, t); a.gain.linearRampToValueAtTime(.028, t + .02); a.gain.exponentialRampToValueAtTime(.0005, t + 2.6);
    a.connect(music); a.connect(send); o.start(t); o.stop(t + 2.7);
  }
  function bass(n, t, dur, v) {
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), a = g(0), o2g = g(.25);
    o.type = 'sine'; o2.type = 'triangle'; o.frequency.value = o2.frequency.value = midi(n);
    o.connect(a); o2.connect(o2g).connect(a); env(a, t, .2 * v, .01, dur);
    a.connect(music); o.start(t); o2.start(t); o.stop(t + dur + .1); o2.stop(t + dur + .1);
  }
  let fluteFreq = midi(69);
  function flute(n, t, dur, vel) {
    const f = midi(n), o = ctx.createOscillator(), o2 = ctx.createOscillator(), a = g(0), vib = ctx.createOscillator(), vd = g(0);
    o.type = 'sine'; o2.type = 'triangle';
    [o, o2].forEach(x => { x.frequency.setValueAtTime(fluteFreq, t); x.frequency.exponentialRampToValueAtTime(f, t + .07); });
    vib.frequency.value = 5.2; vd.gain.setValueAtTime(0, t); vd.gain.linearRampToValueAtTime(f * .012, t + Math.min(dur, .8));
    vib.connect(vd); vd.connect(o.frequency); vd.connect(o2.frequency);
    const o2g = g(.22); o2.connect(o2g).connect(a); o.connect(a);
    const br = burst(t, dur + .2), bg = g(.03); br.connect(filt('bandpass', f * 2, 6)).connect(bg).connect(a);
    a.gain.setValueAtTime(0, t); a.gain.linearRampToValueAtTime(.07 * vel, t + .07);
    a.gain.setValueAtTime(.06 * vel, t + dur * .8); a.gain.linearRampToValueAtTime(0, t + dur + .12);
    a.connect(music); a.connect(send); a.connect(delay);
    [o, o2, vib].forEach(x => { x.start(t); x.stop(t + dur + .2); });
    fluteFreq = f;
  }
  function dholakGe(t, v) { // bass head: palm-pressed upward glide
    const o = ctx.createOscillator(), a = g(0);
    o.frequency.setValueAtTime(78, t); o.frequency.exponentialRampToValueAtTime(118, t + .13);
    env(a, t, .5 * v, .003, .32); o.connect(a).connect(music); o.start(t); o.stop(t + .4);
  }
  function dholakNa(t, v) { // treble head: ringing slap
    const a = g(0);
    [[520, 'triangle', 1], [790, 'sine', .5], [1240, 'sine', .25]].forEach(([f, type, k]) => {
      const o = ctx.createOscillator(), og = g(k); o.type = type; o.frequency.setValueAtTime(f * 1.04, t); o.frequency.exponentialRampToValueAtTime(f, t + .02);
      o.connect(og).connect(a); o.start(t); o.stop(t + .14);
    });
    const c = g(0); burst(t, .03).connect(filt('bandpass', 3000, 1.5)).connect(c).connect(a); env(c, t, .8, .001, .025);
    env(a, t, .2 * v, .001, .11); a.connect(music);
  }
  function ghungroo(t, v) {
    const a = g(0); burst(t, .12).connect(filt('bandpass', 7200, 3)).connect(a); env(a, t, .07 * v, .002, .1);
    a.connect(music); a.connect(send);
  }
  function clap(t, v) {
    const a = g(0); [0, .011, .022].forEach(d => { const s = burst(t + d, .02); s.connect(filt('bandpass', 1300, 1.2)).connect(a); });
    env(a, t, .16 * v, .002, .14); a.connect(music); a.connect(send);
  }

  // ---------------- song sequencer ----------------
  let step = 0, next = 0, inten = .2, target = .2, phrase = [], muted = false, custom = null, birdT = 0, songBar = 0;
  const S = { engine: 0, water: 0, falls: 0, birds: .6, speed: 0 };

  function makePhrase() { // a 2-bar bansuri phrase on the 8th-note grid
    const out = []; let i = Math.floor(Math.random() * 3) + 2, pos = Math.random() < .5 ? 0 : 2;
    while (pos < 28) {
      const len = [2, 2, 4, 1, 3, 6][Math.floor(Math.random() * 6)];
      i = Math.max(0, Math.min(SCALE.length - 1, i + [-2, -1, -1, 1, 1, 2, 0][Math.floor(Math.random() * 7)]));
      if (Math.random() < .82) out.push({ at: pos, n: SCALE[i], len: Math.min(len, 32 - pos) });
      pos += len + (Math.random() < .25 ? 2 : 0);
    }
    return out;
  }

  // sections of 8 bars: calm 'alaap' when the scene is quiet, otherwise hook ↔ flute verse
  const section = () => inten < .33 ? 'alaap' : (Math.floor(songBar / 8) % 2 === 0 ? 'hook' : 'verse');

  function tick() {
    if (ctx.state !== 'running') return;
    const now = ctx.currentTime;
    if (next < now) next = now + .05;
    inten += (target - inten) * .025;
    while (next < now + .25) {
      const s16 = step % 16, bar = songBar % 8, ch = PROG[bar], sec = section(), sw = s16 % 2 ? STEP * .14 : 0; // light swing
      const t = next + sw;
      if (!custom) {
        if (s16 === 0) harmonium(ch.h, next, STEP * 16, sec === 'alaap' ? .8 : .6);
        if (s16 % 4 === 0) tanpura([45, 50, 50, 38][s16 / 4], next);
        if (sec !== 'alaap') {
          // bass + dholak keherwa
          if (s16 === 0 || s16 === 6 || s16 === 10) bass(ch.b, t, s16 === 0 ? .5 : .25, s16 === 0 ? 1 : .75);
          if (s16 === 0 || s16 === 6 || s16 === 10 || (s16 === 3 && bar % 2)) dholakGe(t, s16 === 0 ? 1 : .8);
          if (s16 === 4 || s16 === 12 || s16 === 14) dholakNa(t, 1);
          if (s16 === 2 || s16 === 8 || s16 === 15) dholakNa(t, .35);
          if (s16 % 2 === 0) ghungroo(t, s16 % 8 === 4 ? 1 : .5);
          if (inten > .8 && (s16 === 4 || s16 === 12)) clap(t, 1);
        }
        if (sec === 'hook') { // sitar plays the hook (flute doubles it an octave up at the peaks)
          const tok = HOOK[bar][s16 / 2];
          if (s16 % 2 === 0 && tok && tok !== '-' && tok !== '.') {
            const row = HOOK[bar]; let len = 1; for (let k = s16 / 2 + 1; k < 8 && row[k] === '-'; k++) len++;
            sitar(NOTE[tok], t, len * STEP * 2, .9 + Math.random() * .1);
            if (inten > .85) flute(NOTE[tok] + 12, t, len * STEP * 2 * .9, .45);
          }
        } else {
          if (s16 === 0 && bar % 2 === 0) phrase = Math.random() < .5 + inten * .4 ? makePhrase() : [];
          const k = (bar % 2) * 16 + s16;
          phrase.filter(p => p.at === k).forEach(p => flute(p.n, next, p.len * STEP * 1.9, .8 + Math.random() * .2));
          if (sec === 'verse' && s16 % 4 === 2 && Math.random() < .35) sitar(ch.h[Math.floor(Math.random() * 3)] + 12, t, STEP * 2, .5); // sitar fills
        }
      }
      next += STEP; step++;
      if (step % 16 === 0) songBar++;
    }
    engine.gain.setTargetAtTime(S.engine * (.07 + S.speed * .05), now, .3);
    e1.frequency.setTargetAtTime(36 + S.speed * 22, now, .4); e2.frequency.setTargetAtTime(73 + S.speed * 44, now, .4);
    water.gain.setTargetAtTime(Math.max(S.water * .09, S.falls * .4), now, 1);
    waterHi.gain.setTargetAtTime(S.falls * .09 + S.water * .02, now, 1);
    cicada.gain.setTargetAtTime(.01 * S.birds, now, 2);
    if (custom) custom.gain.gain.setTargetAtTime(.75 * (1 - S.falls * .3), now, .08);
    if (now > birdT) { birdT = now + 1.2 + Math.random() * 4 / (S.birds + .2); if (Math.random() < S.birds) chirp(now + .05, Math.random() * 1.6 - .8); }
  }
  setInterval(tick, 60);

  // your own track, if provided
  fetch('music/theme.mp3', { method: 'HEAD' }).then(r => {
    if (!r.ok) return;
    const el = new Audio('music/theme.mp3'); el.loop = true;
    const src = ctx.createMediaElementSource(el), gain = g(.75); src.connect(gain).connect(master);
    custom = { el, gain };
    if (ctx.state === 'running') el.play().catch(() => {});
  }).catch(() => {});

  return {
    ctx,
    stream() { if (!recDest) { recDest = ctx.createMediaStreamDestination(); comp.connect(recDest); } return recDest.stream; },
    async start() {
      // resume() stays pending forever while autoplay is blocked, so never wait on it for long
      try { await Promise.race([ctx.resume(), new Promise(r => setTimeout(r, 250))]); } catch { /* blocked until a gesture */ }
      if (ctx.state === 'running') {
        master.gain.setTargetAtTime(muted ? 0 : .9, ctx.currentTime, 1.5);
        custom?.el.play().catch(() => {});
      }
      return ctx.state === 'running';
    },
    toggleMute() { muted = !muted; master.gain.setTargetAtTime(muted ? 0 : .9, ctx.currentTime, .3); },
    restart() { songBar = 0; phrase = []; custom && (custom.el.currentTime = 0); },
    // intensity 0..1 drives the arrangement; the rest drive the ambience
    set(o) { if (o.intensity !== undefined) target = o.intensity; Object.assign(S, o); },
  };
}
