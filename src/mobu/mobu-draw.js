// =====================================================================
//  MOBU ÇİZİM KÜTÜPHANESİ (ES modül)
//  JUIT Shorts üretim kitindeki onaylı Mobu çizimi birebir taşındı.
//  Koordinat sistemi: (m.x, m.y) = AYAK ALTI orta noktası; s=1'de boy
//  ≈470 px (saç tepesi y≈-472), gövde ≈230 px geniş, yüz merkezi (0,-326).
//  Sitede küçük ölçek kullanılır (s ≈ 0.22–0.4).
//
//  Kullanım:
//    import { mk, mobu, stageMobu, walk, landSq, ARM_UPS, setBoil } from './mobu-draw.js'
//    setBoil(Math.floor(t*8));            // 8 fps "boil" titreşimi (el çizimi hissi)
//    const m = mk(t, x, y, 0.3);          // nefes alan varsayılan Mobu
//    m.face = 'happy'; m.armR = ARM_UPS;  // ifade / kol pozu
//    stageMobu(ctx, m);                   // gölge + Mobu
//
//  m alanları: x,y, gy (gölge zemini), s, sx,sy (squash/stretch), bw,bh
//  (gövde oranı), rot (radyan), lie (0..1 yatma), face, smile, look (-1..1),
//  lookY, blink (0/1), hairBounce, armL/armR {e:[x,y],h:[x,y]} (sağ kol için
//  yazılır, sol aynalanır), legL/legR [dx,dy], sweat (alfa)+sweatT, tear, nosh.
//  face: calm | happy | star | o | O | scared | T | proud | x | angry | sus |
//        sad | closed | flat
// =====================================================================

export const INK = '#1B1426', PURPLE = '#8B3DFF', GLOW = '#B67CFF', LAV = '#E9DDFF', LAV2 = '#DCCBFF';
export const RED = '#EF4A5C', RED2 = '#C7304A', GOLD = '#F5C542';

// ---------- matematik / easing ----------
export const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const lin = (t, a, b) => clamp((t - a) / (b - a));
export const lerp = (a, b, k) => a + (b - a) * k;
export const eOut = x => 1 - Math.pow(1 - x, 3);
export const eIn = x => x * x * x;
export const eIO = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
export const eBack = x => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2) };
export const eEl = x => x <= 0 ? 0 : x >= 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - .75) * 2 * Math.PI / 3) + 1;
export const S3 = x => { x = clamp(x); return x * x * (3 - 2 * x) };
export const pulse = (t, a, d) => { const x = (t - a) / d; return x < 0 || x > 1 ? 0 : Math.sin(Math.PI * x) };
export const popK = (t, t0, d = .3) => eBack(lin(t, t0, t0 + d));
export function hash(n) { n |= 0; n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); n ^= n >>> 16; return (n >>> 0) / 4294967296 * 2 - 1 }
let BOIL = 0;
export function setBoil(v) { BOIL = v | 0 }
export const nz = i => hash(i * 7919 + BOIL * 104729 + 17);

// ---------- doku ----------
function mkHatch(col, alpha) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = c.height = 160; const g = c.getContext('2d'); let s = 11;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  g.strokeStyle = col; g.globalAlpha = alpha; g.lineCap = 'round';
  for (let i = 0; i < 70; i++) { const x = r() * 200 - 20, y = r() * 200 - 20, l = 20 + r() * 40; g.lineWidth = .8 + r() * 1.4; g.beginPath(); g.moveTo(x, y); g.lineTo(x + l * .8, y - l * .55); g.stroke() }
  return g.createPattern(c, 'repeat');
}
let HATCH_D = null, HATCH_L = null;
function ensureHatch() { if (!HATCH_D) { HATCH_D = mkHatch('#3a1a80', .22); HATCH_L = mkHatch('#7a5ab8', .16) } }

// ---------- şekil ilkelleri (el çizimi "ink") ----------
export function jit(pts, seed, amp) { return pts.map((p, i) => [p[0] + nz(seed + i * 2) * amp, p[1] + nz(seed + i * 2 + 1) * amp]) }
export function smooth(g, pts) { const n = pts.length, m = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; let s = m(pts[n - 1], pts[0]); g.moveTo(s[0], s[1]); for (let i = 0; i < n; i++) { const p = pts[i], q = m(p, pts[(i + 1) % n]); g.quadraticCurveTo(p[0], p[1], q[0], q[1]) } g.closePath() }
export function ell(cx, cy, rx, ry, n = 22, rot = 0) { const o = []; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; const x = Math.cos(a) * rx, y = Math.sin(a) * ry; o.push([cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)]) } return o }
export function heart(cx, cy, w, h) { const o = []; for (let i = 0; i < 28; i++) { const a = i / 28 * Math.PI * 2; const x = 16 * Math.pow(Math.sin(a), 3), y = -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)); o.push([cx + x / 32 * w, cy + y / 30 * h]) } return o }
export function drawGroup(g, shapes, ol = 5.5) {
  g.lineJoin = 'round'; g.lineCap = 'round';
  for (const s of shapes) {
    if (s.noOutline) continue;
    g.strokeStyle = INK;
    if (s.line) {
      const L = jit(s.line, s.seed, 1.6); g.lineWidth = s.w + ol * 2; g.beginPath(); L.forEach((p, i) => i ? g.lineTo(...p) : g.moveTo(...p)); g.stroke();
      const L2 = jit(s.line, s.seed + 50, 3); g.lineWidth = s.w + ol * 2 + 2.5; g.globalAlpha = .35; g.beginPath(); L2.forEach((p, i) => i ? g.lineTo(...p) : g.moveTo(...p)); g.stroke(); g.globalAlpha = 1;
    } else {
      g.lineWidth = ol * 2; g.beginPath(); smooth(g, jit(s.pts, s.seed, 1.8)); g.stroke();
      g.lineWidth = 1.6; g.globalAlpha = .55; g.beginPath(); smooth(g, jit(s.pts, s.seed + 77, 4.2)); g.stroke(); g.globalAlpha = 1;
    }
  }
  for (const s of shapes) {
    if (s.line) { const L = jit(s.line, s.seed, 1.6); g.strokeStyle = s.fill; g.lineWidth = s.w; g.beginPath(); L.forEach((p, i) => i ? g.lineTo(...p) : g.moveTo(...p)); g.stroke() }
    else {
      const P = jit(s.pts, s.seed, 1.8); g.fillStyle = s.fill; g.beginPath(); smooth(g, P); g.fill();
      if (s.hatch) { g.save(); g.beginPath(); smooth(g, P); g.clip(); g.fillStyle = s.hatch; g.translate(nz(s.seed + 999) * 6, nz(s.seed + 998) * 6); g.fillRect(-2000, -2000, 4000, 4000); g.restore() }
    }
  }
}
export function inkLine(g, pts, w, seed = 0, col = INK) { g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round'; const P = jit(pts, seed, 1.1); g.beginPath(); P.forEach((p, i) => i ? g.lineTo(...p) : g.moveTo(...p)); g.stroke() }
export function quadInk(g, a, c, b, w, seed = 0) { const P = jit([a, c, b], seed, 1.0); g.strokeStyle = INK; g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); g.moveTo(...P[0]); g.quadraticCurveTo(...P[1], ...P[2]); g.stroke() }

// ---------- kol pozları (sağ kol yerel koordinat; sol aynalanır) ----------
export const ARM_DEF = { e: [112, -170], h: [118, -100] };
export const DEF_ARM = ARM_DEF;
export const ARM_UPS = { e: [130, -232], h: [138, -312] };          // eller yukarı
export const ARM_HIP = { e: [150, -196], h: [96, -150] };           // eller belde (gururlu)
export const ARM_HEAD = { e: [170, -300], h: [92, -420] };          // eller başta (korku)
export const ARM_CATCH = { e: [128, -205], h: [138, -232] };
export const ARM_SHRUG = { e: [150, -250], h: [170, -222] };        // omuz silkme
export const ARM_SCARED = { e: [104, -300], h: [84, -392] };
export const ARM_PUNCH = { e: [112, -175], h: [158, -172] };
export const ARM_WAVE = t => ({ e: [130, -232], h: [148, -300 + Math.sin(t * 12) * 26] });
export const ARM_POINT = { e: [150, -230], h: [200, -250] };        // ileri işaret
export const ARM_CHIN = { e: [120, -230], h: [40, -300] };          // çeneyi tutma (düşünceli)
export function lerpArm(a, b, k) { return { e: [lerp(a.e[0], b.e[0], k), lerp(a.e[1], b.e[1], k)], h: [lerp(a.h[0], b.h[0], k), lerp(a.h[1], b.h[1], k)] } }

// ---------- MOBU ----------
export function mobu(g, p) {
  ensureHatch();
  g.save();
  const lie = p.lie || 0;
  g.translate(p.x + 210 * lie * (p.s || 1), p.y - 95 * lie * (p.s || 1)); g.rotate((p.rot || 0) - Math.PI / 2 * lie); g.scale((p.s || 1) * (p.sx || 1), (p.s || 1) * (p.sy || 1));
  const sd = 1000;
  const aL = p.armL || ARM_DEF, aR = p.armR || ARM_DEF;
  const legL = p.legL || [0, 0], legR = p.legR || [0, 0];
  const bw = p.bw || 1, bh = p.bh || 1;
  // bacaklar + gövde
  drawGroup(g, [
    { line: [[-38 * bw, -120], [-45 * bw + legL[0], -26 + legL[1]]], w: 60 * Math.sqrt(bw), fill: PURPLE, seed: sd + 10 },
    { line: [[38 * bw, -120], [45 * bw + legR[0], -26 + legR[1]]], w: 60 * Math.sqrt(bw), fill: PURPLE, seed: sd + 20 },
    { pts: ell(0, -185 - 6 * (bh - 1) * 10, 100 * bw, 98 * bh), fill: PURPLE, hatch: HATCH_D, seed: sd + 30 },
  ]);
  // ayaklar
  drawGroup(g, [{ pts: ell(-54 * bw + legL[0], -16 + legL[1], 48, 20), fill: LAV, seed: sd + 40 }, { pts: ell(54 * bw + legR[0], -16 + legR[1], 48, 20), fill: LAV, seed: sd + 50 }]);
  for (const [sx, o] of [[-1, legL], [1, legR]]) { for (const d of [-14, 8]) { inkLine(g, [[sx * 54 * bw + o[0] + d, -8 + o[1]], [sx * 54 * bw + o[0] + d + 3, -20 + o[1]]], 3.2, sd + 60 + d) } }
  // göğüs (kalp)
  drawGroup(g, [{ pts: heart(0, -176 - 6 * (bh - 1) * 10, 128 * bw, 120 * bh), fill: LAV, hatch: HATCH_L, seed: sd + 70, noOutline: true }]);
  // kollar
  const ax = v => v * (1 + (bw - 1) * .85);
  const arm = (side, a, seed) => ({ line: [[side * ax(82), -248], [side * ax(a.e[0]), a.e[1]], [side * ax(a.h[0]), a.h[1]]], w: 52, fill: PURPLE, seed });
  drawGroup(g, [arm(-1, aL, sd + 80), arm(1, aR, sd + 90)]);
  drawGroup(g, [{ pts: ell(-ax(aL.h[0]), aL.h[1] + 6, 30, 28), fill: LAV, seed: sd + 100 }, { pts: ell(ax(aR.h[0]), aR.h[1] + 6, 30, 28), fill: LAV, seed: sd + 110 }]);
  for (const [sx, a] of [[-1, aL], [1, aR]]) { const hx = ax(a.h[0]); inkLine(g, [[sx * hx - 6, a.h[1] + 12], [sx * hx - 2, a.h[1] + 26]], 3, sd + 120 + sx); inkLine(g, [[sx * hx + 8, a.h[1] + 12], [sx * hx + 10, a.h[1] + 26]], 3, sd + 125 + sx) }
  // kulaklar (kafanın arkasında)
  drawGroup(g, [{ pts: ell(-110, -322, 42, 42), fill: PURPLE, seed: sd + 130 }, { pts: ell(110, -322, 42, 42), fill: PURPLE, seed: sd + 140 }]);
  drawGroup(g, [{ pts: ell(-110, -322, 25, 25), fill: LAV, seed: sd + 150, noOutline: true }, { pts: ell(110, -322, 25, 25), fill: LAV, seed: sd + 160, noOutline: true }]);
  // kafa + saç
  const hb = p.hairBounce || 0;
  const hair = [[-62, -400], [-22, -470 - hb * 14], [6, -420], [52, -472 - hb * 18], [66, -414], [112, -440 - hb * 12], [96, -372], [0, -380]];
  drawGroup(g, [{ pts: hair, fill: PURPLE, seed: sd + 170 }, { pts: ell(0, -326, 114, 100), fill: PURPLE, hatch: HATCH_D, seed: sd + 180 }]);
  if (p.sweat) { g.save(); g.globalAlpha = p.sweat; const sy = (p.sweatT || 0) % 1; g.fillStyle = '#8FD3FF'; g.strokeStyle = INK; g.lineWidth = 3; g.beginPath(); g.moveTo(-118, -400 + sy * 40); g.quadraticCurveTo(-136, -370 + sy * 40, -118, -360 + sy * 40); g.quadraticCurveTo(-100, -370 + sy * 40, -118, -400 + sy * 40); g.fill(); g.stroke(); g.restore() }
  // yüz yaması
  const lx = (p.look || 0) * 6;
  g.save(); g.translate(lx * .6, 0);
  drawGroup(g, [{ pts: ell(-40, -336, 44, 40), fill: LAV, seed: sd + 190, noOutline: true }, { pts: ell(40, -336, 44, 40), fill: LAV, seed: sd + 200, noOutline: true }, { pts: ell(0, -290, 80, 46), fill: LAV, hatch: HATCH_L, seed: sd + 210, noOutline: true }]);
  // gözler
  const face = p.face || 'calm', bl = p.blink || 0;
  g.translate(lx, 0);
  for (const sx of [-1, 1]) {
    const ex = sx * 38, ey = -336;
    if (face === 'happy') { quadInk(g, [ex - 14, ey + 4], [ex, ey - 12], [ex + 14, ey + 4], 5.5, sd + 220 + sx) }
    else if (face === 'star') { const r = 17; g.fillStyle = '#FFD23F'; g.strokeStyle = INK; g.lineWidth = 4; g.beginPath(); for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? r * .5 : r; const px = ex + Math.cos(a) * rr, py = ey - 2 + Math.sin(a) * rr; i ? g.lineTo(px, py) : g.moveTo(px, py) } g.closePath(); g.fill(); g.stroke(); g.fillStyle = '#fff'; g.beginPath(); g.arc(ex - 4, ey - 6, 3, 0, 7); g.fill() }
    else if (face === 'o') { g.strokeStyle = INK; g.lineWidth = 5; g.beginPath(); g.ellipse(ex, ey, 9, 11, 0, 0, 7); g.stroke(); g.fillStyle = INK; g.beginPath(); g.arc(ex, ey, 3.5, 0, 7); g.fill() }
    else if (face === 'O' || face === 'scared') { const r = face === 'scared' ? 15 : 12; g.fillStyle = '#fff'; g.strokeStyle = INK; g.lineWidth = 5; g.beginPath(); g.ellipse(ex, ey - 2, r, r * 1.15, 0, 0, 7); g.fill(); g.stroke(); g.fillStyle = INK; g.beginPath(); g.arc(ex + (p.look || 0) * 3, ey + (p.lookY || 0) * 3, face === 'scared' ? 3.5 : 5, 0, 7); g.fill() }
    else if (face === 'T') { inkLine(g, [[ex - 15, ey - 4], [ex + 15, ey - 4]], 5.5, sd + 236 + sx); inkLine(g, [[ex, ey - 4], [ex, ey + 12]], 5, sd + 237 + sx); g.fillStyle = '#7FC8FF'; g.beginPath(); g.ellipse(ex + sx * 2, ey + 26 + ((p.tear || 0) % 1) * 30, 5, 8, 0, 0, 7); g.fill() }
    else if (face === 'proud') { g.fillStyle = INK; g.beginPath(); g.ellipse(ex, ey + 3, 10, 6, 0, 0, Math.PI); g.fill(); inkLine(g, [[ex - 17, ey + 1], [ex + 16, ey + 1]], 6.5, sd + 238 + sx); inkLine(g, [[ex - 12, ey - 22], [ex + 12, ey - 26]], 4.5, sd + 239 + sx) }
    else if (face === 'x') { inkLine(g, [[ex - 13, ey - 13], [ex + 13, ey + 13]], 6, sd + 270 + sx); inkLine(g, [[ex + 13, ey - 13], [ex - 13, ey + 13]], 6, sd + 272 + sx) }
    else if (face === 'angry') { inkLine(g, [[ex - sx * 12, ey - 10], [ex + sx * 10, ey], [ex - sx * 12, ey + 10]], 5.5, sd + 235 + sx) }
    else if (face === 'sus') { const px = ex + ((p.look || 0) >= 0 ? 6 : -6); g.fillStyle = INK; g.beginPath(); g.ellipse(px, ey + 1, 8, 6, 0, 0, Math.PI); g.fill(); inkLine(g, [[ex - 17, ey], [ex + 16, ey]], 6, sd + 245 + sx); if (sx > 0) inkLine(g, [[ex - 12, ey - 24], [ex + 14, ey - 30]], 4.5, sd + 246) }
    else if (face === 'sad') { g.fillStyle = INK; g.beginPath(); g.ellipse(ex, ey + 3, 10, 7, 0, 0, Math.PI); g.fill(); inkLine(g, [[ex - 16, ey + (sx < 0 ? -5 : 4)], [ex + 15, ey + (sx < 0 ? 4 : -5)]], 5.5, sd + 247 + sx) }
    else if (face === 'closed' || bl > .5) { quadInk(g, [ex - 14, ey], [ex, ey + 5], [ex + 14, ey], 5, sd + 230 + sx) }
    else { g.fillStyle = INK; g.beginPath(); g.ellipse(ex + sx * 1, ey + 1, 11, 8.5, 0, 0, Math.PI); g.fill(); inkLine(g, [[ex - 17, ey - 1 + (sx < 0 ? 1 : -1)], [ex + 16, ey + (sx < 0 ? -1 : 1)]], 5.5, sd + 240 + sx) }
  }
  // ağız
  const sm = p.smile == null ? 1 : p.smile;
  if (face === 'star') { g.fillStyle = INK; g.beginPath(); g.moveTo(-24, -292); g.quadraticCurveTo(0, -250, 24, -292); g.closePath(); g.fill(); g.fillStyle = '#E0567A'; g.beginPath(); g.ellipse(0, -277, 11, 6, 0, 0, 7); g.fill() }
  else if (face === 'o' || face === 'O') { g.strokeStyle = INK; g.lineWidth = 4.5; g.beginPath(); g.ellipse(0, -282, 7, 8, 0, 0, 7); g.stroke() }
  else if (face === 'scared') { g.fillStyle = INK; g.beginPath(); g.ellipse(0, -280, 15, 19, 0, 0, 7); g.fill(); g.fillStyle = '#E0567A'; g.beginPath(); g.ellipse(0, -270, 9, 6, 0, 0, 7); g.fill() }
  else if (face === 'T') { quadInk(g, [-13, -282], [0, -293], [13, -282], 4.5, sd + 254) }
  else if (face === 'flat') { inkLine(g, [[-14, -288], [14, -288]], 4.5, sd + 255) }
  else if (face === 'x') { inkLine(g, [[-18, -284], [-9, -292], [0, -284], [9, -292], [18, -284]], 4.5, sd + 257) }
  else if (face === 'proud') { quadInk(g, [-17, -292], [2, -276], [18, -298], 5, sd + 256) }
  else if (face === 'angry') { inkLine(g, [[-14, -286], [-5, -292], [4, -286], [13, -292]], 4.5, sd + 251) }
  else if (face === 'sad') { quadInk(g, [-14, -284], [0, -296], [14, -284], 4.5, sd + 252) }
  else if (face === 'sus') { quadInk(g, [-12, -289], [2, -287], [15, -293], 4.5, sd + 253) }
  else if (face === 'happy' && sm > 1) { g.fillStyle = INK; g.beginPath(); g.moveTo(-20, -292); g.quadraticCurveTo(0, -262, 20, -292); g.closePath(); g.fill() }
  else quadInk(g, [-15, -290], [0, -290 + 9 * sm], [15, -290 - 1 * sm], 4.5, sd + 250);
  g.restore();
  g.restore();
}

export function shadow(g, x, y, rx) { g.fillStyle = 'rgba(0,0,0,.38)'; g.beginPath(); g.ellipse(x, y + 2, rx, rx * .22, 0, 0, 7); g.fill() }

// Nefes alan varsayılan Mobu. (x,y) ayak altı, s ölçek.
export function mk(t, x, y, s) {
  return { x, y, gy: y, s, bw: 1.05, bh: 1, sx: 1 - .012 * Math.sin(t * 2.2), sy: 1 + .014 * Math.sin(t * 2.2), hairBounce: .3 * Math.sin(t * 2.2), blink: (t % 3.7) < .12 ? 1 : 0, look: 0, smile: 1, face: 'calm' };
}
// Yürüme: faz = t*sp; dir yürüyüş yönü (+1 sağ)
export function walk(m, t, dir = 1, sp = 11, amp = 1) {
  const c = Math.sin(t * sp);
  m.legL = [c * 26 * amp, -Math.max(0, c) * 28 * amp]; m.legR = [-c * 26 * amp, -Math.max(0, -c) * 28 * amp];
  m.armL = { e: [128, -190 + c * 22 * amp], h: [135, -118 + c * 28 * amp] }; m.armR = { e: [128, -190 - c * 22 * amp], h: [135, -118 - c * 28 * amp] };
  m.rot = (m.rot || 0) + .05 * dir * amp; m.y -= Math.abs(c) * 7 * amp * (m.s || 1); m.hairBounce = .6 * Math.abs(c) * amp;
}
// Havada duruş (zıplama): u 0..1 yay ilerlemesi
export function airPose(m, u = .5) { m.legL = [-8, -26]; m.legR = [8, -30]; m.hairBounce = 1.4; m.sy *= 1 + .07 * Math.sin(Math.PI * u); m.sx *= 1 - .04 * Math.sin(Math.PI * u) }
// İniş squash'ı: k 0..1 darbe miktarı
export function squash(m, k) { m.sy *= 1 - .22 * k; m.sx *= 1 + .13 * k; m.hairBounce = (m.hairBounce || 0) + 1.2 * k }
export function landSq(m, t, tl, amt = 1, d = .22) { squash(m, pulse(t, tl, d) * amt) }
export function pancake(m, k) { m.sx *= lerp(1, 2.0, k); m.sy *= lerp(1, .26, k) }
export function stageMobu(g, m, shr = 110) { if (m.nosh !== true) shadow(g, m.x, m.gy + (m.shy || 0), shr * m.s * (1 - Math.min(.4, (m.gy - m.y) / (900 * m.s)))); mobu(g, m) }
export function handPos(m, side) {
  const bw = m.bw || 1, ax = v => v * (1 + (bw - 1) * .85); const a = side > 0 ? (m.armR || ARM_DEF) : (m.armL || ARM_DEF);
  const s = m.s || 1, px = side * ax(a.h[0]) * s * (m.sx || 1), py = (a.h[1] + 6) * s * (m.sy || 1), r = m.rot || 0;
  return [m.x + px * Math.cos(r) - py * Math.sin(r), m.y + px * Math.sin(r) + py * Math.cos(r)];
}
// Yüz merkezi (dünya): yazı/etiketleri bunun üstüne koyma
export function facePos(m) { const s = m.s || 1; return [m.x, m.y - 326 * s * (m.sy || 1)] }
// Mobu'nun kapladığı kutu (dünya): [x0,y0,x1,y1]
export function bbox(m) { const s = (m.s || 1); const w = 170 * s * (m.sx || 1), h = 480 * s * (m.sy || 1); return [m.x - w, m.y - h, m.x + w, m.y + 6 * s] }
