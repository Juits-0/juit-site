// math.js — matematik, yumuşatma (easing), rastgelelik ve çarpışma yardımcıları
export const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const lin = (t, a, b) => clamp((t - a) / (b - a));           // t'yi a..b aralığında 0..1'e çevirir
export const lerp = (a, b, k) => a + (b - a) * k;
export const lerp2 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];
export const eOut = x => 1 - Math.pow(1 - x, 3);
export const eIn = x => x * x * x;
export const eIO = x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
export const eBack = x => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
export const eEl = x => (x <= 0 ? 0 : x >= 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * 2 * Math.PI / 3) + 1);
export const S3 = x => { x = clamp(x); return x * x * (3 - 2 * x); };
// t anında a..a+d aralığında 0→1→0 çanı
export const pulse = (t, a, d) => { const x = (t - a) / d; return x < 0 || x > 1 ? 0 : Math.sin(Math.PI * x); };
// t0'da başlayan eBack "pop" girişi (0→1, hafif aşar)
export const popK = (t, t0, d = 0.3) => eBack(lin(t, t0, t0 + d));
// a..b arasında görünür: fi sürede girer, fo sürede çıkar (0..1)
export const win = (t, a, b, fi = 0.25, fo = 0.2) => lin(t, a, a + fi) * (1 - lin(t, b - fo, b));

// tamsayıdan -1..1 deterministik hash
export function hash(n) {
  n |= 0; n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); n ^= n >>> 16;
  return (n >>> 0) / 4294967296 * 2 - 1;
}
export const hash01 = n => hash(n) * 0.5 + 0.5;
// tohumlu rastgele (mulberry32): const r = rng(7); r() → 0..1
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// hex renkler arası karışım → 'rgb(r,g,b)'
export function lerpCol(a, b, k) {
  const pa = [1, 3, 5].map(i => parseInt(a.substr(i, 2), 16)), pb = [1, 3, 5].map(i => parseInt(b.substr(i, 2), 16));
  return `rgb(${pa.map((v, i) => Math.round(lerp(v, pb[i], clamp(k)))).join(',')})`;
}

// ---- çarpışma ----
// iki doğru parçası kesişir mi (AB ile CD)
export function segHit(ax, ay, bx, by, cx, cy, dx, dy) {
  const d1x = bx - ax, d1y = by - ay, d2x = dx - cx, d2y = dy - cy;
  const den = d1x * d2y - d1y * d2x;
  if (Math.abs(den) < 1e-9) return false;
  const t = ((cx - ax) * d2y - (cy - ay) * d2x) / den, u = ((cx - ax) * d1y - (cy - ay) * d1x) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}
// daire (cx,cy,r) ile dikdörtgen (rx,ry,rw,rh)
export function circleRect(cx, cy, r, rx, ry, rw, rh) {
  const nx = clamp(cx, rx, rx + rw), ny = clamp(cy, ry, ry + rh);
  return (cx - nx) * (cx - nx) + (cy - ny) * (cy - ny) <= r * r;
}
// dikdörtgenler {x,y,w,h} (sol-üst köşe)
export const rectRect = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
// iki açı arasındaki en kısa fark (-π..π)
export function angDiff(a, b) { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; }
// cur'u target'a en fazla maxDelta kadar yaklaştırır
export function moveToward(cur, target, maxDelta) {
  return Math.abs(target - cur) <= maxDelta ? target : cur + Math.sign(target - cur) * maxDelta;
}
