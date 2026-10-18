// audio.js — WebAudio ile sentezlenen kısa ses efektleri (dosya yok). Tepe seviyesi ≈ −12 dB.
// İlk pointerdown/keydown'da resume edilir. Tercih localStorage'da saklanır.
import { store } from './store.js';

let ctx = null, master = null, noiseBuf = null;
let enabled = store.get('sfx', true) !== false;
const last = {};

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
  ctx = new AC();
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6;
  master = ctx.createGain(); master.gain.value = 0.5; master.connect(comp); comp.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}
// osilatör: f0→f1 frekans kayması, zarf (hızlı atak, üstel sönüm)
function tone({ f0 = 440, f1 = null, dur = 0.12, type = 'sine', vol = 0.25, delay = 0, atk = 0.005, vib = 0 }) {
  const t0 = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t0); if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
  if (vib) { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = 22; lg.gain.value = vib; l.connect(lg); lg.connect(o.frequency); l.start(t0); l.stop(t0 + dur + 0.05); }
  g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(vol, t0 + atk); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + dur + 0.02);
}
function noise({ dur = 0.15, vol = 0.2, type = 'lowpass', f0 = 1000, f1 = null, q = 1, delay = 0 }) {
  const t0 = ctx.currentTime + delay, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf; f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t0); if (f1) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(vol, t0 + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t0, Math.random() * 0.5); s.stop(t0 + dur + 0.02);
}

const SFX = {
  click: () => tone({ f0: 900, f1: 600, dur: 0.05, type: 'square', vol: 0.12 }),
  pop: () => tone({ f0: 420, f1: 980, dur: 0.09, type: 'sine', vol: 0.28 }),
  jump: () => tone({ f0: 250, f1: 560, dur: 0.15, type: 'triangle', vol: 0.28 }),
  land: () => { noise({ dur: 0.1, vol: 0.2, f0: 500, f1: 150 }); tone({ f0: 130, f1: 60, dur: 0.1, vol: 0.25 }); },
  coin: () => { tone({ f0: 988, dur: 0.07, type: 'square', vol: 0.14 }); tone({ f0: 1319, dur: 0.22, type: 'square', vol: 0.14, delay: 0.07 }); },
  hit: () => { noise({ dur: 0.12, vol: 0.28, type: 'bandpass', f0: 1800, f1: 500, q: 1.2 }); tone({ f0: 200, f1: 60, dur: 0.14, type: 'sawtooth', vol: 0.2 }); },
  hurt: () => { tone({ f0: 340, f1: 90, dur: 0.28, type: 'sawtooth', vol: 0.24 }); noise({ dur: 0.1, vol: 0.14, f0: 1200 }); },
  ko: () => { tone({ f0: 420, f1: 70, dur: 0.6, type: 'sine', vol: 0.28, vib: 18 }); noise({ dur: 0.18, vol: 0.14, f0: 600, f1: 120, delay: 0.02 }); },
  alarm: () => { for (let i = 0; i < 3; i++) { tone({ f0: 880, dur: 0.1, type: 'square', vol: 0.14, delay: i * 0.2 }); tone({ f0: 660, dur: 0.1, type: 'square', vol: 0.14, delay: i * 0.2 + 0.1 }); } },
  boom: () => { noise({ dur: 0.55, vol: 0.4, f0: 320, f1: 50 }); tone({ f0: 85, f1: 34, dur: 0.55, vol: 0.4 }); },
  tick: () => tone({ f0: 1800, dur: 0.025, type: 'square', vol: 0.1 }),
  whoosh: () => noise({ dur: 0.26, vol: 0.2, type: 'bandpass', f0: 400, f1: 2400, q: 0.8 }),
  laser: () => tone({ f0: 1800, f1: 220, dur: 0.16, type: 'sawtooth', vol: 0.16 }),
  warn: () => { tone({ f0: 520, dur: 0.1, type: 'triangle', vol: 0.24 }); tone({ f0: 520, dur: 0.1, type: 'triangle', vol: 0.24, delay: 0.16 }); },
  success: () => { [523, 659, 784, 1047].forEach((f, i) => tone({ f0: f, dur: i === 3 ? 0.4 : 0.12, type: 'triangle', vol: 0.26, delay: i * 0.09 })); },
  slowIn: () => tone({ f0: 620, f1: 140, dur: 0.42, type: 'sine', vol: 0.25 }),
  slowOut: () => tone({ f0: 140, f1: 620, dur: 0.3, type: 'sine', vol: 0.25 }),
};

export const audio = {
  get enabled() { return enabled; },
  set enabled(v) { enabled = !!v; store.set('sfx', enabled); },
  // kullanıcı etkileşiminde bağlamı aç
  unlock() { const c = ensure(); if (c && c.state === 'suspended') c.resume(); },
  play(name) {
    if (!enabled) return;
    const f = SFX[name]; if (!f) return;
    const c = ensure(); if (!c) return;
    if (c.state === 'suspended') { c.resume(); }
    const now = performance.now(); if (last[name] && now - last[name] < 30) return; last[name] = now;   // aynı sesi üst üste bindirme
    try { f(); } catch (_) { /* ses hatası oyunu durdurmasın */ }
  },
};
const unlockOnce = () => { audio.unlock(); window.removeEventListener('pointerdown', unlockOnce, true); window.removeEventListener('keydown', unlockOnce, true); };
window.addEventListener('pointerdown', unlockOnce, true);
window.addEventListener('keydown', unlockOnce, true);
