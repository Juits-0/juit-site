// ui.js — canvas üzerinde yazı, çip, çubuk, kalp ve JT logosu
import { clamp, eIO, eBack } from './math.js';
import { INK, PURPLE, RED, FONT, MONO, heart, smooth } from './ink.js';

// yazı. align: 'center' | 'left' | 'right'. weight 400..900. mono=true → JetBrains Mono
export function txt(g, s, x, y, size, col = '#F5F5F5', align = 'center', weight = 900, mono = false) {
  g.font = `${weight} ${size}px ${mono ? MONO : FONT}`; g.textAlign = align; g.textBaseline = 'middle'; g.fillStyle = col; g.fillText(s, x, y);
}
// konturlu yazı (koyu zemin üstünde okunurluk için)
export function txtInk(g, s, x, y, size, col = '#fff', align = 'center', weight = 900, ink = INK) {
  g.font = `${weight} ${size}px ${FONT}`; g.textAlign = align; g.textBaseline = 'middle'; g.lineJoin = 'round';
  g.strokeStyle = ink; g.lineWidth = size * 0.2; g.strokeText(s, x, y); g.fillStyle = col; g.fillText(s, x, y);
}
export function textW(g, s, size, weight = 900) { g.font = `${weight} ${size}px ${FONT}`; return g.measureText(s).width; }
export function roundBox(g, cx, cy, w, h, r, fill, stroke, lw = 3) {
  g.beginPath(); g.roundRect(cx - w / 2, cy - h / 2, w, h, r);
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); }
}
// beyaz/mor kapsül çip (merkez x,y). on=true → mor dolgu. Dönüş: genişlik
export function chip(g, text, x, y, on = false, size = 16) {
  g.save(); g.font = `900 ${size}px ${FONT}`;
  const w = g.measureText(text).width + size * 1.7, h = size * 1.9;
  g.translate(x, y);
  g.fillStyle = on ? PURPLE : '#F5F5F5'; g.strokeStyle = INK; g.lineWidth = 3;
  g.beginPath(); g.roundRect(-w / 2, -h / 2, w, h, h / 2); g.fill(); g.stroke();
  g.fillStyle = on ? '#fff' : INK; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 0, 1); g.restore();
  return w;
}
// düz kapsül etiket (koyu zeminde): dolgu col, yazı beyaz. Merkez x,y
export function pill(g, text, x, y, col = PURPLE, size = 13, tcol = '#fff') {
  g.save(); g.font = `800 ${size}px ${FONT}`;
  const w = g.measureText(text).width + size * 1.5, h = size * 1.8;
  g.fillStyle = col; g.beginPath(); g.roundRect(x - w / 2, y - h / 2, w, h, h / 2); g.fill();
  g.fillStyle = tcol; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, x, y + 0.5); g.restore();
  return w;
}
// doluluk çubuğu (sol-üst x,y). k 0..1
export function bar(g, x, y, w, h, k, col = PURPLE, bg = 'rgba(255,255,255,.12)') {
  g.save(); g.fillStyle = bg; g.beginPath(); g.roundRect(x, y, w, h, h / 2); g.fill();
  const kk = clamp(k); if (kk > 0) { g.fillStyle = col; g.beginPath(); g.roundRect(x, y, Math.max(h, w * kk), h, h / 2); g.fill(); }
  g.restore();
}
// kalpler (sol-üst x,y); n dolu, max toplam
export function hearts(g, x, y, n, max = 3, size = 22) {
  for (let i = 0; i < max; i++) {
    const cx = x + i * (size + 6) + size / 2, cy = y + size / 2;
    g.save(); g.beginPath(); smooth(g, heart(cx, cy, size, size)); g.fillStyle = i < n ? RED : 'rgba(255,255,255,.12)'; g.fill();
    g.strokeStyle = INK; g.lineWidth = 2.5; g.stroke(); g.restore();
  }
}
// ---- JT logosu (çizgi sürümü). (x,y) merkez, s ölçek (s=.1 → ~80 px), p 0..1 çizilme ilerlemesi ----
const LJ = [[338, 228], [557, 228], [484, 668], [316, 778], [100, 778], [122, 620], [230, 560], [210, 672], [308, 672], [362, 632], [408, 338], [232, 338]];
const LT = [[586, 228], [912, 228], [888, 338], [798, 338], [738, 684], [590, 790], [662, 350], [570, 350]];
const LACC = [[[510, 298], [530, 298], [522, 340], [500, 340]], [[838, 268], [888, 268], [878, 338], [826, 338]]];
export function jtLogo(g, x, y, s, p = 1, col = '#F5F5F5', glow = 0) {
  if (p <= 0) return;
  g.save(); g.translate(x, y); g.scale(s, s); g.translate(-506, -509);
  g.lineJoin = 'miter'; g.strokeStyle = col; g.lineWidth = 14; if (glow) { g.shadowColor = PURPLE; g.shadowBlur = glow; }
  for (const P of [LJ, LT]) {
    const L = P.length; let tot = 0; for (let i = 0; i < L; i++) { const a = P[i], b = P[(i + 1) % L]; tot += Math.hypot(b[0] - a[0], b[1] - a[1]); }
    let rem = tot * eIO(clamp(p * 1.3)); g.beginPath(); g.moveTo(...P[0]);
    for (let i = 1; i <= L; i++) { const a = P[i - 1], b = P[i % L], d = Math.hypot(b[0] - a[0], b[1] - a[1]); if (rem >= d) { g.lineTo(...b); rem -= d; } else { g.lineTo(a[0] + (b[0] - a[0]) * rem / d, a[1] + (b[1] - a[1]) * rem / d); break; } }
    g.stroke();
  }
  const ak = clamp((p - 0.7) / 0.3); if (ak > 0) { g.fillStyle = PURPLE; g.globalAlpha = ak; for (const A of LACC) { g.beginPath(); A.forEach((q, i) => i ? g.lineTo(...q) : g.moveTo(...q)); g.closePath(); g.fill(); } }
  g.restore();
}
export { eBack };
