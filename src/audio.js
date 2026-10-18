// audio.js - JUIT sentezlenmiş ses efektleri (WebAudio, dosya yok).
// Kullanım: import { sfx } from './audio.js';
//   sfx.setEnabled(true)  -> kullanıcı jestinden çağır (açar, AudioContext'i başlatır)
//   sfx.play('click', { gain: 0.8, rate: 1.1 })
// Varsayılan kapalı; tercih localStorage 'juit.sfx' anahtarında saklanır.
// Kullanıcı jesti olmadan ses asla başlamaz.

const KEY = 'juit.sfx';
let ctx = null, master = null, noiseBuf = null, on = false;
try { on = localStorage.getItem(KEY) === '1'; } catch (e) {}

function unlock() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      const comp = ctx.createDynamicsCompressor();
      master = ctx.createGain();
      master.gain.value = 0.18;
      master.connect(comp);
      comp.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
  } catch (e) {}
}

// Yardımcılar -------------------------------------------------------------
// Zarf: hızlı atak, üstel sönüm
function env(g, t, dur, peak, atk = 0.004) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + atk);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}
function osc(o, type, f0, f1, t, dur, peak, rate, dest, detune = 0) {
  const os = ctx.createOscillator(), g = ctx.createGain();
  os.type = type;
  os.detune.value = detune;
  os.frequency.setValueAtTime(f0 * rate, t);
  if (f1 && f1 !== f0) os.frequency.exponentialRampToValueAtTime(f1 * rate, t + dur);
  env(g, t, dur, peak * o.g);
  os.connect(g); g.connect(dest || master);
  os.start(t); os.stop(t + dur + 0.02);
  return g;
}
function noise(o, t, dur, peak, ftype, fa, fb, rate, q = 1) {
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf;
  f.type = ftype; f.Q.value = q;
  f.frequency.setValueAtTime(fa * rate, t);
  if (fb) f.frequency.exponentialRampToValueAtTime(fb * rate, t + dur);
  env(g, t, dur, peak * o.g, Math.min(0.01, dur / 3));
  s.connect(f); f.connect(g); g.connect(master);
  s.start(t); s.stop(t + dur + 0.02);
}
// Notalar: dizi [frekans, başlangıç, süre]
function notes(o, type, list, peak, rate, dest, lp) {
  let out = dest || master;
  if (lp) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = lp;
    f.connect(out); out = f;
  }
  for (const [f, at, d] of list) osc(o, type, f, 0, o.t + at, d, peak, rate, out);
}

// Ses tanımları -----------------------------------------------------------
const S = {
  click: (o, r) => osc(o, 'sine', 880, 660, o.t, 0.03, 0.8, r),
  hover: (o, r) => osc({ ...o, g: o.g * 0.3 }, 'sine', 1400, 1200, o.t, 0.015, 0.8, r),
  pop: (o, r) => osc(o, 'triangle', 300, 900, o.t, 0.09, 0.9, r),
  whoosh: (o, r) => noise(o, o.t, 0.22, 1.2, 'bandpass', 400, 2200, r, 1.5),
  open: (o, r) => notes(o, 'sine', [[440, 0, 0.06], [660, 0.06, 0.06]], 0.8, r),
  close: (o, r) => notes(o, 'sine', [[660, 0, 0.06], [440, 0.06, 0.06]], 0.8, r),
  switch: (o, r) => {
    osc(o, 'square', 1200, 0, o.t, 0.02, 0.35, r);
    noise(o, o.t, 0.025, 0.8, 'lowpass', 2500, 0, r);
  },
  jump: (o, r) => osc(o, 'sine', 320, 720, o.t, 0.12, 0.9, r),
  land: (o, r) => {
    osc(o, 'sine', 140, 60, o.t, 0.11, 1, r);
    noise(o, o.t, 0.04, 0.25, 'lowpass', 800, 0, r);
  },
  step: (o, r) => noise({ ...o, g: o.g * 0.5 }, o.t, 0.02, 0.8, 'bandpass', 1800, 0, r, 2),
  save: (o, r) => notes(o, 'square', [[880, 0, 0.06], [1320, 0.06, 0.06]], 0.3, r, null, 2400),
  coin: (o, r) => notes(o, 'square', [[880, 0, 0.06], [1320, 0.06, 0.09]], 0.3, r, null, 2400),
  win: (o, r) => {
    // kısa geri beslemeli gecikme = hafif yankı
    const bus = ctx.createGain(), dl = ctx.createDelay(0.2), fb = ctx.createGain(), wet = ctx.createGain();
    dl.delayTime.value = 0.09; fb.gain.value = 0.35; wet.gain.value = 0.4;
    bus.connect(master); bus.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(wet); wet.connect(master);
    notes(o, 'triangle', [[523.25, 0, 0.12], [659.25, 0.08, 0.12], [783.99, 0.16, 0.12], [1046.5, 0.24, 0.22]], 0.8, r, bus);
  },
  fail: (o, r) => {
    for (const dt of [-12, 12]) {
      osc(o, 'sawtooth', 440, 0, o.t, 0.1, 0.25, r, null, dt);
      osc(o, 'sawtooth', 330, 0, o.t + 0.1, 0.1, 0.25, r, null, dt);
      osc(o, 'sawtooth', 220, 0, o.t + 0.2, 0.1, 0.25, r, null, dt);
    }
  },
  alarm: (o, r) => notes(o, 'sawtooth', [[660, 0, 0.08], [660, 0.12, 0.08]], 0.35, r, null, 1500),
  hit: (o, r) => {
    noise(o, o.t, 0.08, 0.9, 'lowpass', 3000, 400, r);
    osc(o, 'sine', 200, 50, o.t, 0.15, 1, r);
  },
  logo: (o, r) => {
    osc(o, 'sine', 70, 40, o.t, 0.7, 1.3, r);
    noise(o, o.t + 0.05, 0.5, 0.5, 'bandpass', 3000, 8000, r, 2);
  },
  secret: (o, r) => {
    const f = [220, 261.63, 329.63, 440, 523.25]; // La minör
    notes(o, 'sine', f.map((x, i) => [x, i * 0.11, 0.3]), 0.5, r);
  }
};

export const sfx = {
  get enabled() { return on; },
  setEnabled(v) {
    on = !!v;
    try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) {}
    if (on) unlock();
  },
  unlock,
  play(name, opts = {}) {
    if (!on || !ctx || !S[name]) return;
    try {
      const o = { t: ctx.currentTime + 0.005, g: opts.gain == null ? 1 : opts.gain };
      S[name](o, opts.rate || 1);
    } catch (e) {}
  },
  names: Object.keys(S)
};

try {
  const gate = () => { if (on) unlock(); };
  window.addEventListener('pointerdown', gate, { passive: true });
  window.addEventListener('keydown', gate, { passive: true });
} catch (e) {}
