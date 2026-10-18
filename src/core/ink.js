// ink.js — elle çizilmiş (ink) çizgi ilkelleri. Kaynak: JuitShorts/_kit/lib/core.js (birebir taşındı)
import { hash } from './math.js';

export const INK = '#1B1426', PAPER = '#F7F4FB', PURPLE = '#8B3DFF', GLOW = '#B67CFF', LAV = '#E9DDFF', LAV2 = '#DCCBFF';
export const RED = '#EF4A5C', RED2 = '#C7304A', RED3 = '#FFD0D6';
export const GOLD = '#F5C542', GOLD2 = '#C98F1C', GOLD3 = '#FFE9A0';
export const BG = '#0A0A0A', PANEL = '#171717', LINE = '#2B2B2B', GRAY = '#8C8C8C', WHITE = '#F5F5F5';
export const FONT = 'Inter, system-ui, -apple-system, "Segoe UI", sans-serif';
export const MONO = '"JetBrains Mono", ui-monospace, Consolas, monospace';

// ---- boil: çizgi titremesi (8 fps). Her karede setBoil(this.time) çağır. ----
let BOIL = 0;
export const setBoil = t => { BOIL = Math.floor(t * 8); };
export const getBoil = () => BOIL;
export const setBoilRaw = n => { BOIL = n; };
export const nz = i => hash(i * 7919 + BOIL * 104729 + 17);

// ---- tarama dokusu ----
const _pc = document.createElement('canvas').getContext('2d');
function mkHatch(col, alpha) {
  const c = document.createElement('canvas'); c.width = c.height = 160; const g = c.getContext('2d');
  let s = 11; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  g.strokeStyle = col; g.globalAlpha = alpha; g.lineCap = 'round';
  for (let i = 0; i < 70; i++) { const x = r() * 200 - 20, y = r() * 200 - 20, l = 20 + r() * 40; g.lineWidth = 0.8 + r() * 1.4; g.beginPath(); g.moveTo(x, y); g.lineTo(x + l * 0.8, y - l * 0.55); g.stroke(); }
  return _pc.createPattern(c, 'repeat');
}
export const HATCH_D = mkHatch('#3a1a80', 0.22), HATCH_L = mkHatch('#7a5ab8', 0.16), HATCH_R = mkHatch('#7a0a1a', 0.2);

// ---- çizim ilkelleri ----
export function jit(pts, seed, amp) { return pts.map((p, i) => [p[0] + nz(seed + i * 2) * amp, p[1] + nz(seed + i * 2 + 1) * amp]); }
export function smooth(g, pts) {
  const n = pts.length, m = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const s = m(pts[n - 1], pts[0]); g.moveTo(s[0], s[1]);
  for (let i = 0; i < n; i++) { const p = pts[i], q = m(p, pts[(i + 1) % n]); g.quadraticCurveTo(p[0], p[1], q[0], q[1]); }
  g.closePath();
}
export function ell(cx, cy, rx, ry, n = 22, rot = 0) {
  const o = [];
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; const x = Math.cos(a) * rx, y = Math.sin(a) * ry; o.push([cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)]); }
  return o;
}
export function heart(cx, cy, w, h) {
  const o = [];
  for (let i = 0; i < 28; i++) { const a = i / 28 * Math.PI * 2; const x = 16 * Math.pow(Math.sin(a), 3), y = -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)); o.push([cx + x / 32 * w, cy + y / 30 * h]); }
  return o;
}
// shape: {pts, fill, hatch, seed, noOutline} (kapalı, yumuşatılmış) ya da {line:[pts], w, fill, seed}
export function drawGroup(g, shapes, ol = 5.5) {
  g.lineJoin = 'round'; g.lineCap = 'round';
  for (const s of shapes) {
    if (s.noOutline) continue;
    g.strokeStyle = INK;
    if (s.line) {
      const L = jit(s.line, s.seed, 1.6); g.lineWidth = s.w + ol * 2; g.beginPath(); L.forEach((p, i) => i ? g.lineTo(...p) : g.moveTo(...p)); g.stroke();
      const L2 = jit(s.line, s.seed + 50, 3); g.lineWidth = s.w + ol * 2 + 2.5; g.globalAlpha = 0.35; g.beginPath(); L2.forEach((p, i) => i ? g.lineTo(...p) : g.moveTo(...p)); g.stroke(); g.globalAlpha = 1;
    } else {
      g.lineWidth = ol * 2; g.beginPath(); smooth(g, jit(s.pts, s.seed, 1.8)); g.stroke();
      g.lineWidth = 1.6; g.globalAlpha = 0.55; g.beginPath(); smooth(g, jit(s.pts.map(p => p), s.seed + 77, 4.2)); g.stroke(); g.globalAlpha = 1;
    }
  }
  for (const s of shapes) {
    if (s.line) { const L = jit(s.line, s.seed, 1.6); g.strokeStyle = s.fill; g.lineWidth = s.w; g.beginPath(); L.forEach((p, i) => i ? g.lineTo(...p) : g.moveTo(...p)); g.stroke(); }
    else {
      const P = jit(s.pts, s.seed, 1.8); g.fillStyle = s.fill; g.beginPath(); smooth(g, P); g.fill();
      if (s.hatch) { g.save(); g.beginPath(); smooth(g, P); g.clip(); g.fillStyle = s.hatch; g.translate(nz(s.seed + 999) * 6, nz(s.seed + 998) * 6); g.fillRect(-2000, -2000, 4000, 4000); g.restore(); }
    }
  }
}
export function inkLine(g, pts, w, seed = 0, col = INK) {
  g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round';
  const P = jit(pts, seed, 1.1); g.beginPath(); P.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.stroke();
}
export function quadInk(g, a, c, b, w, seed = 0) {
  const P = jit([a, c, b], seed, 1.0); g.strokeStyle = INK; g.lineWidth = w; g.lineCap = 'round';
  g.beginPath(); g.moveTo(...P[0]); g.quadraticCurveTo(...P[1], ...P[2]); g.stroke();
}
// köşeli (poligon) şekil: elle çizilmiş kontur + dolgu + isteğe bağlı tarama
export function polyPath(g, P) { g.beginPath(); P.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); }
export function poly(g, pts, fill, seed, ol = 6, hatch) {
  const P = jit(pts, seed, 1.5); g.lineJoin = 'round'; g.lineCap = 'round';
  g.strokeStyle = INK; g.lineWidth = ol * 2; polyPath(g, P); g.stroke();
  g.lineWidth = 1.6; g.globalAlpha = 0.5; polyPath(g, jit(pts, seed + 70, 4)); g.stroke(); g.globalAlpha = 1;
  g.fillStyle = fill; polyPath(g, P); g.fill();
  if (hatch) { g.save(); polyPath(g, P); g.clip(); g.fillStyle = hatch; g.translate(nz(seed + 9) * 6, nz(seed + 8) * 6); g.fillRect(-2000, -2000, 4000, 4000); g.restore(); }
}
// iki parçalı kol için ters kinematik (omuz S → hedef T). sgn: kolun hangi tarafa kıvrılacağı (±1)
export function ik(S, T, sgn, L1, L2) {
  const dx = T[0] - S[0], dy = T[1] - S[1], Ld = Math.hypot(dx, dy) || 1, ux = dx / Ld, uy = dy / Ld, d = Math.max(40, Math.min(Ld, L1 + L2 - 3));
  const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, L1 * L1 - a * a)), px = -uy, py = ux;
  const e1 = [S[0] + ux * a + px * h, S[1] + uy * a + py * h], e2 = [S[0] + ux * a - px * h, S[1] + uy * a - py * h];
  return { e: (e1[0] * sgn > e2[0] * sgn) ? e1 : e2, f: [S[0] + ux * d, S[1] + uy * d] };
}
