// previews.js — laboratuvar monitörlerindeki küçük canlı döngüler. preview_<id>(g, t, w, h)
// g: ekranın sol-üstüne taşınmış ve kırpılmış canvas bağlamı; t: saniye; w,h: ekran boyutu (~156×110).
// Hepsi deterministik, ucuz ve mor/beyaz/kırmızı basit şekillerden oluşur.
import { clamp, lin, lerp, eIO, eOut, eBack, pulse } from '../core/math.js';

const P = '#8B3DFF', GL = '#B67CFF', LV = '#E9DDFF', R = '#EF4A5C', GD = '#F5C542', W = '#F5F5F5';
const dot = (g, x, y, r, c) => { g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); };
const base = (g, w, h, tint = 0) => {
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#120d1c'); gr.addColorStop(1, '#0a0810');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  if (tint) { g.fillStyle = `rgba(139,61,255,${tint})`; g.fillRect(0, 0, w, h); }
};
const floor = (g, w, y, c = '#2B2B2B') => { g.fillStyle = c; g.fillRect(0, y, w, 3); };

// 1 · saldırı sırası: oyuncu ortada, kırmızı düşmanlar çevresinde bekler, sırayla biri atılır
function sirayla(g, t, w, h) {
  base(g, w, h); const cx = w / 2, cy = h / 2 + 4, N = 4, T = 0.9, k = Math.floor(t / T) % N, u = (t % T) / T;
  g.strokeStyle = 'rgba(139,61,255,.25)'; g.lineWidth = 1.5; g.beginPath(); g.arc(cx, cy, 40, 0, 7); g.stroke();
  for (let i = 0; i < N; i++) {
    const a = i / N * Math.PI * 2 + Math.PI / 4 + t * 0.2; let r = 40;
    if (i === k) r = lerp(40, 10, u < 0.5 ? eIO(u * 2) : 1 - eOut((u - 0.5) * 2));
    dot(g, cx + Math.cos(a) * r, cy + Math.sin(a) * r, 7, R);
  }
  dot(g, cx, cy, 8, P); dot(g, cx, cy, 3.5, LV);
}
// 2 · düşman görüşü: dönen görüş konisi, oyuncu noktası koninin içindeyken uyarı
function gorus(g, t, w, h) {
  base(g, w, h); const ex = 28, ey = h / 2, a = Math.sin(t * 0.9) * 0.55, L = 96;
  const px = w - 30, py = h / 2 + Math.sin(t * 1.3) * 24, ang = Math.atan2(py - ey, px - ex), seen = Math.abs(ang - a) < 0.33;
  g.fillStyle = seen ? 'rgba(239,74,92,.35)' : 'rgba(182,124,255,.28)'; g.beginPath(); g.moveTo(ex, ey); g.arc(ex, ey, L + 20, a - 0.33, a + 0.33); g.closePath(); g.fill();
  dot(g, ex, ey, 7, R); dot(g, px, py, 6, seen ? R : W);
  g.fillStyle = '#2B2B2B'; g.fillRect(w * 0.55, h * 0.12, 5, h * 0.2);
}
// 3 · coyote: nokta kenardan ayrılır, havada bir an durup zıplar
function coyote(g, t, w, h) {
  base(g, w, h); const gy = h * 0.68; g.fillStyle = '#2B2B2B'; g.fillRect(0, gy, w * 0.38, h); g.fillRect(w * 0.7, gy, w, h);
  g.fillStyle = P; g.fillRect(0, gy, w * 0.38, 3); g.fillRect(w * 0.7, gy, w, 3);
  const u = (t % 2.6) / 2.6; let x, y;
  if (u < 0.35) { x = lerp(8, w * 0.38 + 6, u / 0.35); y = gy - 8; }
  else if (u < 0.5) { x = w * 0.38 + 6 + (u - 0.35) * 40; y = gy - 8 + Math.pow((u - 0.35) / 0.15, 2) * 5; }
  else { const k = (u - 0.5) / 0.5; x = lerp(w * 0.38 + 12, w * 0.7 + 10, k); y = gy - 8 - Math.sin(Math.PI * k) * 30; }
  if (u > 0.35 && u < 0.5) { g.strokeStyle = 'rgba(182,124,255,.6)'; g.setLineDash([3, 3]); g.strokeRect(w * 0.38 - 6, gy - 20, 14, 18); g.setLineDash([]); }
  dot(g, x, y, 7, W);
}
// 4 · yönlendirme: parlayan nokta dizisi kapıya götürür
function yonlendirme(g, t, w, h) {
  base(g, w, h); const n = 7, y = h * 0.55;
  for (let i = 0; i < n; i++) {
    const x = 16 + i * (w - 52) / (n - 1), p = clamp(1 - Math.abs(((t * 4) % (n + 3)) - i) / 2.2);
    dot(g, x, y + Math.sin(i * 0.9) * 8, 2.5 + p * 3, p > 0.05 ? GL : '#3a3050');
  }
  const gx = w - 18, gr = g.createRadialGradient(gx, y, 1, gx, y, 30); gr.addColorStop(0, 'rgba(233,221,255,.9)'); gr.addColorStop(1, 'rgba(139,61,255,0)'); g.fillStyle = gr; g.fillRect(gx - 30, y - 30, 60, 60);
  g.fillStyle = LV; g.fillRect(gx - 6, y - 16, 12, 28);
}
// 5 · chunk: oyuncu ilerledikçe yakındaki kareler yüklenir, uzaktakiler kapanır
function chunk(g, t, w, h) {
  base(g, w, h); const cols = 7, rows = 4, cw = (w - 12) / cols, ch = (h - 12) / rows, px = 0.5 + 0.5 * Math.sin(t * 0.8), pc = px * (cols - 1);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const d = Math.abs(c - pc), on = d < 1.7, x = 6 + c * cw, y = 6 + r * ch;
    g.fillStyle = on ? (d < 0.9 ? P : 'rgba(139,61,255,.45)') : '#1d1828'; g.fillRect(x + 1.5, y + 1.5, cw - 3, ch - 3);
  }
  dot(g, 6 + pc * cw + cw / 2, h / 2, 5, W);
}
// 6 · ödül: dönen altın + parıltılar
function odul(g, t, w, h) {
  base(g, w, h, 0.04); const cx = w / 2, cy = h / 2, sx = Math.abs(Math.cos(t * 3)) * 0.85 + 0.15;
  g.save(); g.translate(cx, cy + Math.sin(t * 2.4) * 3); g.scale(sx, 1);
  g.fillStyle = GD; g.strokeStyle = '#C98F1C'; g.lineWidth = 3; g.beginPath(); g.arc(0, 0, 20, 0, 7); g.fill(); g.stroke();
  g.fillStyle = '#FFE9A0'; g.fillRect(-3, -11, 6, 22); g.restore();
  const u = (t % 1.6) / 1.6;
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2, r = 26 + u * 22; g.globalAlpha = 1 - u; dot(g, cx + Math.cos(a) * r, cy + Math.sin(a) * r, 2.5 * (1 - u) + 0.5, i % 2 ? W : GD); }
  g.globalAlpha = 1;
}
// 7 · boss telegraph: büyüyen kırmızı uyarı dairesi, sonra darbe
function boss(g, t, w, h) {
  base(g, w, h); const cx = w / 2, cy = h * 0.6, u = (t % 2.4) / 2.4, k = Math.min(1, u / 0.7);
  g.fillStyle = `rgba(239,74,92,${0.12 + 0.18 * k})`; g.beginPath(); g.ellipse(cx, cy, 46 * k + 2, 16 * k + 1, 0, 0, 7); g.fill();
  g.strokeStyle = R; g.lineWidth = 2; g.beginPath(); g.ellipse(cx, cy, 46, 16, 0, 0, 7); g.stroke();
  if (u > 0.7 && u < 0.85) { g.fillStyle = `rgba(239,74,92,${1 - (u - 0.7) / 0.15})`; g.beginPath(); g.ellipse(cx, cy, 46, 16, 0, 0, 7); g.fill(); }
  g.fillStyle = '#3A3446'; g.fillRect(cx - 12, 10 + (u > 0.7 ? 28 * Math.min(1, (u - 0.7) / 0.1) : -4 * k), 24, 26);
  dot(g, cx + 34 * Math.sin(t * 1.2) * (u < 0.7 ? 1 : 0.2), cy + 6, 5, W);
}
// 8 · zaman: mermiler akar; yavaşlama anında nokta sıyrılır
function zaman(g, t, w, h) {
  const slow = (t % 3) > 1.5; base(g, w, h, slow ? 0.1 : 0); const sp = slow ? 18 : 70, tt = (t % 3) * sp;
  for (let i = 0; i < 4; i++) { const y = 18 + i * 25, x = ((w + 20 - (tt + i * 41) % (w + 40)) + w + 40) % (w + 40) - 10; dot(g, x, y, 4, R); if (!slow) { g.fillStyle = 'rgba(239,74,92,.25)'; g.fillRect(x, y - 1.5, 14, 3); } }
  dot(g, w * 0.5, 18 + 50 * (0.5 + 0.5 * Math.sin(t * 1.1)), 6, slow ? GL : W);
  if (slow) { g.strokeStyle = 'rgba(182,124,255,.7)'; g.lineWidth = 2; g.beginPath(); g.arc(w - 16, 16, 8, 0, 7); g.stroke(); g.beginPath(); g.moveTo(w - 16, 16); g.lineTo(w - 16, 11); g.stroke(); }
}
// 9 · hitbox: beyaz hedef, görünmez mor kutu; nişan kutuya girince vuruş
function hitbox(g, t, w, h) {
  base(g, w, h); const cx = w / 2, cy = h / 2, rx = 40;
  g.strokeStyle = 'rgba(182,124,255,.8)'; g.setLineDash([4, 3]); g.lineWidth = 1.5; g.strokeRect(cx - 24, cy - 24, 48, 48); g.setLineDash([]);
  dot(g, cx, cy, 15, W);
  const a = t * 1.4, ax = cx + Math.cos(a) * rx * (0.55 + 0.45 * Math.sin(t * 0.7)), ay = cy + Math.sin(a) * rx * 0.7, inBox = Math.abs(ax - cx) < 24 && Math.abs(ay - cy) < 24, inDot = Math.hypot(ax - cx, ay - cy) < 15;
  g.strokeStyle = inBox ? GL : R; g.lineWidth = 1.5; g.beginPath(); g.arc(ax, ay, 7, 0, 7); g.moveTo(ax - 11, ay); g.lineTo(ax + 11, ay); g.moveTo(ax, ay - 11); g.lineTo(ax, ay + 11); g.stroke();
  if (inBox && !inDot) { g.fillStyle = 'rgba(182,124,255,.25)'; g.fillRect(cx - 24, cy - 24, 48, 48); }
}
// 10 · dokunulmazlık: nokta dikenlerin üstünden yanıp sönerek geçer
function iframes(g, t, w, h) {
  base(g, w, h); const gy = h * 0.7; g.fillStyle = '#2B2B2B'; g.fillRect(0, gy, w, h);
  for (let i = 0; i < 3; i++) { const x = w * (0.28 + i * 0.22); g.fillStyle = R; g.beginPath(); g.moveTo(x - 9, gy); g.lineTo(x, gy - 18); g.lineTo(x + 9, gy); g.fill(); }
  const u = (t % 3) / 3, x = lerp(8, w - 8, u), hit = x > w * 0.28 - 6 && x < w * 0.72 + 6, vis = !hit || Math.floor(t * 12) % 2 === 0;
  if (vis) dot(g, x, gy - 7 - (hit ? 6 : 0), 6, hit ? GL : W);
  if (hit) { g.strokeStyle = 'rgba(182,124,255,.7)'; g.lineWidth = 1.5; g.beginPath(); g.arc(x, gy - 13, 11, 0, 7); g.stroke(); }
}
// 11 · LOD: aynı küre, kenar sayısı azalan çokgenler
function lod(g, t, w, h) {
  base(g, w, h); const lv = [14, 8, 5, 3], k = Math.floor(t / 0.9) % lv.length, n = lv[k], cx = w / 2, cy = h / 2, r = 26 + Math.sin(t * 3) * 0;
  g.strokeStyle = GL; g.fillStyle = 'rgba(139,61,255,.45)'; g.lineWidth = 2; g.beginPath();
  for (let i = 0; i <= n; i++) { const a = i / n * Math.PI * 2 - Math.PI / 2 + t * 0.6, px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r; i ? g.lineTo(px, py) : g.moveTo(px, py); }
  g.fill(); g.stroke();
  for (let i = 0; i < lv.length; i++) dot(g, cx - 18 + i * 12, h - 12, 3, i === k ? W : '#3a3050');
}
// 12 · ayna: çerçeve, nokta ve yansıması
function ayna(g, t, w, h) {
  base(g, w, h); const mx = w * 0.62; g.fillStyle = 'rgba(233,221,255,.1)'; g.fillRect(mx, 10, w - mx - 10, h - 20); g.strokeStyle = LV; g.lineWidth = 2; g.strokeRect(mx, 10, w - mx - 10, h - 20);
  const x = lerp(14, mx - 16, 0.5 + 0.5 * Math.sin(t * 1.1)); dot(g, x, h / 2 + 4, 8, W);
  const rx = mx + (mx - x); if (rx > mx && rx < w - 12) { g.globalAlpha = 0.5; dot(g, rx, h / 2 + 4, 8, GL); g.globalAlpha = 1; }
}

export const PREVIEWS = { sirayla, gorus, coyote, yonlendirme, chunk, odul, boss, zaman, hitbox, iframes, lod, ayna };
