// fx.js — parçacıklar, parıltılar ve işaret çizimleri
import { clamp, lerp, eOut, eBack, hash01, rng } from './math.js';
import { INK, PURPLE, GLOW, LAV, RED, GOLD, GOLD3, FONT, inkLine, nz } from './ink.js';

// ---- ışık / halka çizimleri (dünya koordinatında; g neresi ise orada) ----
export function glowAt(g, x, y, r, rgb, a, sy = 1) {
  if (a <= 0 || r <= 0) return;
  g.save(); g.globalCompositeOperation = 'lighter'; g.translate(x, y); g.scale(1, sy);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, r);
  gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(0.4, `rgba(${rgb},${a * 0.4})`); gr.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gr; g.fillRect(-r, -r, 2 * r, 2 * r); g.restore();
}
export function starPoly(g, x, y, r, col, rot = 0, ink = true, inner = 0.45) {
  g.beginPath();
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 - Math.PI / 2 + rot, rr = i % 2 ? r * inner : r; const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr; i ? g.lineTo(px, py) : g.moveTo(px, py); }
  g.closePath(); g.fillStyle = col;
  if (ink) { g.strokeStyle = INK; g.lineWidth = Math.max(2, r * 0.16); g.lineJoin = 'round'; g.stroke(); }
  g.fill();
}
// dt: efektin başlangıcından beri geçen süre (sn). 0.45 sn'de söner.
export function ringFlash(g, x, y, dt, R = 320, w = 26, col = '255,255,255') {
  if (dt < 0 || dt > 0.45) return;
  const k = eOut(dt / 0.45); g.save(); g.strokeStyle = `rgba(${col},${(1 - k) * 0.95})`; g.lineWidth = w * (1 - k) + 3;
  g.beginPath(); g.arc(x, y, 40 + R * k, 0, 7); g.stroke(); g.restore();
}
// hız çizgileri: yön dir (-1 sola koşu, +1 sağa), k 0..1 şiddet, (x,y) ayak noktası, s ölçek
export function speedLines(g, x, y, dir, k, s = 1) {
  if (k <= 0) return;
  g.save(); g.globalAlpha = k;
  for (let i = 0; i < 5; i++) {
    const yy = y - (60 + i * 62) * s, l = (210 + i * 40) * s, x0 = x - dir * (110 + ((i * 37) % 3) * 26) * s;
    inkLine(g, [[x0, yy], [x0 - dir * l, yy + 4 * nz(i)]], 5 * s + 1, 9700 + i, 'rgba(233,221,255,.65)');
  }
  g.restore();
}
// kırmızı ✗ damgası (k 0..1 büyüme)
export function xStamp(g, x, y, k, size = 160) {
  if (k <= 0) return;
  g.save(); g.translate(x, y); g.scale(eBack(clamp(k)), eBack(clamp(k))); g.rotate(-0.12); g.lineCap = 'round';
  for (const [c, w] of [[INK, size * 0.2], [RED, size * 0.12]]) { g.strokeStyle = c; g.lineWidth = w; g.beginPath(); g.moveTo(-size / 2, -size / 2); g.lineTo(size / 2, size / 2); g.moveTo(size / 2, -size / 2); g.lineTo(-size / 2, size / 2); g.stroke(); }
  g.restore();
}
// kırmızı ünlem
export function bangMark(g, x, y, sz, k, t, col = RED) {
  if (k <= 0) return;
  g.save(); g.translate(x, y + Math.sin(t * 10) * 3); g.scale(k * sz, k * sz);
  glowAt(g, 0, -10, 150, '239,74,92', 0.55);
  g.lineJoin = 'round'; g.lineCap = 'round';
  const body = () => { g.beginPath(); g.moveTo(-34, -96); g.quadraticCurveTo(0, -112, 34, -96); g.lineTo(18, -26); g.quadraticCurveTo(0, -16, -18, -26); g.closePath(); };
  g.strokeStyle = INK; g.lineWidth = 16; body(); g.stroke(); g.beginPath(); g.arc(0, 16, 17, 0, 7); g.stroke();
  g.fillStyle = col; body(); g.fill(); g.beginPath(); g.arc(0, 16, 17, 0, 7); g.fill();
  g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 5; g.beginPath(); g.moveTo(-18, -86); g.lineTo(-9, -44); g.stroke();
  g.restore();
}
export function twinkle(g, x, y, sz, k, col = '#fff') {
  if (k <= 0) return;
  g.save(); g.translate(x, y); g.scale(k, k); g.fillStyle = col; g.beginPath();
  g.moveTo(0, -sz); g.quadraticCurveTo(0, 0, sz * 0.62, 0); g.quadraticCurveTo(0, 0, 0, sz); g.quadraticCurveTo(0, 0, -sz * 0.62, 0); g.quadraticCurveTo(0, 0, 0, -sz); g.fill(); g.restore();
}

// ---- Parçacık sistemi ----
// Dünya koordinatında çalışır; render içinde kamera dönüşümü uygulanmışken draw(g) çağır.
// tür: 'dust' yumuşak toz, 'spark' kıvılcım çizgisi, 'star' yıldız, 'conf' konfeti, 'zz' uyku harfi, 'dot' daire
export class Particles {
  constructor(max = 400) { this.max = max; this.list = []; this.r = rng(1234); }
  clear() { this.list.length = 0; }
  add(p) { if (this.list.length >= this.max) this.list.shift(); this.list.push(Object.assign({ x: 0, y: 0, vx: 0, vy: 0, g: 0, drag: 0, life: 0.6, age: 0, size: 6, col: GLOW, kind: 'dot', rot: 0, vr: 0, grow: 0 }, p)); }
  // genel patlama: opts {n, speed, life, size, col, g, kind, spread:[a0,a1]}
  burst(x, y, o = {}) {
    const n = o.n || 12, r = this.r, a0 = o.spread ? o.spread[0] : 0, a1 = o.spread ? o.spread[1] : Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const a = lerp(a0, a1, n > 1 ? i / (n - 1) : 0.5) + (r() - 0.5) * 0.3, sp = (o.speed || 200) * (0.5 + r() * 0.7);
      this.add({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: o.g == null ? 400 : o.g, drag: o.drag == null ? 1.5 : o.drag, life: (o.life || 0.6) * (0.7 + r() * 0.5), size: (o.size || 6) * (0.7 + r() * 0.6), col: Array.isArray(o.col) ? o.col[i % o.col.length] : (o.col || GLOW), kind: o.kind || 'dot', rot: r() * 6, vr: (r() - 0.5) * 10 });
    }
  }
  // yere iniş/koşu tozu: (x,y) ayak noktası, dir yönde savrulur (0=iki yana)
  dust(x, y, n = 6, dir = 0) {
    const r = this.r;
    for (let i = 0; i < n; i++) {
      const sd = dir || (i % 2 ? 1 : -1);
      this.add({ x: x + (r() - 0.5) * 16, y: y - 2, vx: sd * (30 + r() * 80) * (dir ? 0.6 : 1), vy: -(10 + r() * 40), g: -20, drag: 2.5, life: 0.45 + r() * 0.3, size: 7 + r() * 7, grow: 14, col: '#B7A9D6', kind: 'dust' });
    }
  }
  sparks(x, y, n = 8, col = GLOW) { this.burst(x, y, { n, speed: 260, life: 0.45, size: 5, col, kind: 'spark', g: 300 }); }
  stars(x, y, n = 6) { this.burst(x, y, { n, speed: 220, life: 0.8, size: 9, col: [GOLD, GOLD3], kind: 'star', g: 260 }); }
  confetti(x, y, n = 40) {
    const r = this.r, cols = [PURPLE, GLOW, LAV, GOLD, '#fff', RED];
    for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + (r() - 0.5) * 2.2, sp = 260 + r() * 340; this.add({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 700, drag: 0.6, life: 1.4 + r() * 0.8, size: 5 + r() * 4, col: cols[i % cols.length], kind: 'conf', rot: r() * 6, vr: (r() - 0.5) * 14 }); }
  }
  // uyku "z" harfi (yavaşça yükselir)
  zz(x, y, size = 16) { this.add({ x, y, vx: 14, vy: -26, g: 0, drag: 0.2, life: 1.6, size, col: LAV, kind: 'zz' }); }
  update(dt) {
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i]; p.age += dt;
      if (p.age >= p.life) { L.splice(i, 1); continue; }
      p.vy += p.g * dt; const d = Math.max(0, 1 - p.drag * dt); p.vx *= d; p.vy *= d;
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; p.size += p.grow * dt;
    }
  }
  draw(g) {
    for (const p of this.list) {
      const u = p.age / p.life, a = 1 - u * u;
      g.save(); g.globalAlpha = clamp(a); g.translate(p.x, p.y); g.rotate(p.rot);
      if (p.kind === 'dust') { const gr = g.createRadialGradient(0, 0, 0, 0, 0, p.size); gr.addColorStop(0, 'rgba(190,178,215,.55)'); gr.addColorStop(1, 'rgba(190,178,215,0)'); g.fillStyle = gr; g.fillRect(-p.size, -p.size, p.size * 2, p.size * 2); }
      else if (p.kind === 'spark') { g.strokeStyle = p.col; g.lineWidth = Math.max(1.5, p.size * 0.5 * (1 - u)); g.lineCap = 'round'; g.beginPath(); g.moveTo(0, 0); g.lineTo(-p.vx * 0.05, -p.vy * 0.05); g.stroke(); }
      else if (p.kind === 'star') { starPoly(g, 0, 0, p.size * (1 - u * 0.4), p.col, 0, true); }
      else if (p.kind === 'conf') { g.fillStyle = p.col; g.scale(1, Math.abs(Math.cos(p.age * 9 + p.size))); g.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66); }
      else if (p.kind === 'zz') { g.fillStyle = p.col; g.font = `900 ${p.size}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.rotate(-p.rot * 0 - 0.2); g.fillText('z', 0, 0); }
      else { g.fillStyle = p.col; g.beginPath(); g.arc(0, 0, p.size * (1 - u * 0.5), 0, 7); g.fill(); }
      g.restore();
    }
  }
}
