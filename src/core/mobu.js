// mobu.js — MOBU'nun kanonik canvas çizimi. Kaynak: JuitShorts/_kit/lib/core.js (birebir taşındı).
// mobu() s=1'de ~470 px boy; (x,y) ayak altı noktasıdır. Lab/oyunlarda s≈.3–.42 kullanılır.
import { clamp, lin, lerp, pulse } from './math.js';
import { INK, PURPLE, LAV, drawGroup, ell, heart, inkLine, quadInk, HATCH_D, HATCH_L } from './ink.js';

// p: {x,y,s,sx,sy,rot,lie, armL/armR:{e,h} (yerel), face, smile, look, blink, hairBounce, legL, legR}
export const ARM_DEF = { e: [112, -170], h: [118, -100] };
export function mobu(g, p) {
  g.save();
  const lie = p.lie || 0;
  g.translate(p.x + 210 * lie, p.y - 95 * lie); g.rotate((p.rot || 0) - Math.PI / 2 * lie); g.scale((p.s || 1) * (p.sx || 1), (p.s || 1) * (p.sy || 1));
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
  for (const [sx, o] of [[-1, legL], [1, legR]]) { for (const d of [-14, 8]) { inkLine(g, [[sx * 54 * bw + o[0] + d, -8 + o[1]], [sx * 54 * bw + o[0] + d + 3, -20 + o[1]]], 3.2, sd + 60 + d); } }
  // göğüs
  drawGroup(g, [{ pts: heart(0, -176 - 6 * (bh - 1) * 10, 128 * bw, 120 * bh), fill: LAV, hatch: HATCH_L, seed: sd + 70, noOutline: true }]);
  // kollar
  const ax = v => v * (1 + (bw - 1) * 0.85);
  const arm = (side, a, seed) => ({ line: [[side * ax(82), -248], [side * ax(a.e[0]), a.e[1]], [side * ax(a.h[0]), a.h[1]]], w: 52, fill: PURPLE, seed });
  drawGroup(g, [arm(-1, aL, sd + 80), arm(1, aR, sd + 90)]);
  drawGroup(g, [{ pts: ell(-ax(aL.h[0]), aL.h[1] + 6, 30, 28), fill: LAV, seed: sd + 100 }, { pts: ell(ax(aR.h[0]), aR.h[1] + 6, 30, 28), fill: LAV, seed: sd + 110 }]);
  for (const [sx, a] of [[-1, aL], [1, aR]]) { const hx = ax(a.h[0]); inkLine(g, [[sx * hx - 6, a.h[1] + 12], [sx * hx - 2, a.h[1] + 26]], 3, sd + 120 + sx); inkLine(g, [[sx * hx + 8, a.h[1] + 12], [sx * hx + 10, a.h[1] + 26]], 3, sd + 125 + sx); }
  // kulaklar (kafanın arkasında)
  drawGroup(g, [{ pts: ell(-110, -322, 42, 42), fill: PURPLE, seed: sd + 130 }, { pts: ell(110, -322, 42, 42), fill: PURPLE, seed: sd + 140 }]);
  drawGroup(g, [{ pts: ell(-110, -322, 25, 25), fill: LAV, seed: sd + 150, noOutline: true }, { pts: ell(110, -322, 25, 25), fill: LAV, seed: sd + 160, noOutline: true }]);
  // kafa + saç (birleşik)
  const hb = p.hairBounce || 0;
  const hair = [[-62, -400], [-22, -470 - hb * 14], [6, -420], [52, -472 - hb * 18], [66, -414], [112, -440 - hb * 12], [96, -372], [0, -380]];
  drawGroup(g, [{ pts: hair, fill: PURPLE, seed: sd + 170 }, { pts: ell(0, -326, 114, 100), fill: PURPLE, hatch: HATCH_D, seed: sd + 180 }]);
  if (p.sweat) { g.save(); g.globalAlpha = p.sweat; const sy = (p.sweatT || 0) % 1; g.fillStyle = '#8FD3FF'; g.strokeStyle = INK; g.lineWidth = 3; g.beginPath(); g.moveTo(-118, -400 + sy * 40); g.quadraticCurveTo(-136, -370 + sy * 40, -118, -360 + sy * 40); g.quadraticCurveTo(-100, -370 + sy * 40, -118, -400 + sy * 40); g.fill(); g.stroke(); g.restore(); }
  // yüz bölgesi
  const lx = (p.look || 0) * 6;
  g.save(); g.translate(lx * 0.6, 0);
  drawGroup(g, [{ pts: ell(-40, -336, 44, 40), fill: LAV, seed: sd + 190, noOutline: true }, { pts: ell(40, -336, 44, 40), fill: LAV, seed: sd + 200, noOutline: true }, { pts: ell(0, -290, 80, 46), fill: LAV, hatch: HATCH_L, seed: sd + 210, noOutline: true }]);
  // gözler
  const face = p.face || 'calm', bl = p.blink || 0;
  g.translate(lx, 0);
  for (const sx of [-1, 1]) {
    const ex = sx * 38, ey = -336;
    if (face === 'happy') { quadInk(g, [ex - 14, ey + 4], [ex, ey - 12], [ex + 14, ey + 4], 5.5, sd + 220 + sx); }
    else if (face === 'star') { const r = 17; g.fillStyle = '#FFD23F'; g.strokeStyle = INK; g.lineWidth = 4; g.beginPath(); for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? r * 0.5 : r; const px = ex + Math.cos(a) * rr, py = ey - 2 + Math.sin(a) * rr; i ? g.lineTo(px, py) : g.moveTo(px, py); } g.closePath(); g.fill(); g.stroke(); g.fillStyle = '#fff'; g.beginPath(); g.arc(ex - 4, ey - 6, 3, 0, 7); g.fill(); }
    else if (face === 'o') { g.strokeStyle = INK; g.lineWidth = 5; g.beginPath(); g.ellipse(ex, ey, 9, 11, 0, 0, 7); g.stroke(); g.fillStyle = INK; g.beginPath(); g.arc(ex, ey, 3.5, 0, 7); g.fill(); }
    else if (face === 'O' || face === 'scared') { const r = face === 'scared' ? 15 : 12; g.fillStyle = '#fff'; g.strokeStyle = INK; g.lineWidth = 5; g.beginPath(); g.ellipse(ex, ey - 2, r, r * 1.15, 0, 0, 7); g.fill(); g.stroke(); g.fillStyle = INK; g.beginPath(); g.arc(ex + (p.look || 0) * 3, ey + (p.lookY || 0) * 3, face === 'scared' ? 3.5 : 5, 0, 7); g.fill(); }
    else if (face === 'T') { inkLine(g, [[ex - 15, ey - 4], [ex + 15, ey - 4]], 5.5, sd + 236 + sx); inkLine(g, [[ex, ey - 4], [ex, ey + 12]], 5, sd + 237 + sx); g.fillStyle = '#7FC8FF'; g.beginPath(); g.ellipse(ex + sx * 2, ey + 26 + ((p.tear || 0) % 1) * 30, 5, 8, 0, 0, 7); g.fill(); }
    else if (face === 'proud') { g.fillStyle = INK; g.beginPath(); g.ellipse(ex, ey + 3, 10, 6, 0, 0, Math.PI); g.fill(); inkLine(g, [[ex - 17, ey + 1], [ex + 16, ey + 1]], 6.5, sd + 238 + sx); inkLine(g, [[ex - 12, ey - 22], [ex + 12, ey - 26]], 4.5, sd + 239 + sx); }
    else if (face === 'x') { inkLine(g, [[ex - 13, ey - 13], [ex + 13, ey + 13]], 6, sd + 270 + sx); inkLine(g, [[ex + 13, ey - 13], [ex - 13, ey + 13]], 6, sd + 272 + sx); }
    else if (face === 'angry') { inkLine(g, [[ex - sx * 12, ey - 10], [ex + sx * 10, ey], [ex - sx * 12, ey + 10]], 5.5, sd + 235 + sx); }
    else if (face === 'sus') { // ¬_¬ : düz kapak, göz bebeği yana kaymış
      const px = ex + (p.look >= 0 ? 6 : -6); g.fillStyle = INK; g.beginPath(); g.ellipse(px, ey + 1, 8, 6, 0, 0, Math.PI); g.fill(); inkLine(g, [[ex - 17, ey], [ex + 16, ey]], 6, sd + 245 + sx); if (sx > 0) inkLine(g, [[ex - 12, ey - 24], [ex + 14, ey - 30]], 4.5, sd + 246);
    }
    else if (face === 'sad') { g.fillStyle = INK; g.beginPath(); g.ellipse(ex, ey + 3, 10, 7, 0, 0, Math.PI); g.fill(); inkLine(g, [[ex - 16, ey + (sx < 0 ? -5 : 4)], [ex + 15, ey + (sx < 0 ? 4 : -5)]], 5.5, sd + 247 + sx); }
    else if (face === 'closed' || bl > 0.5) { quadInk(g, [ex - 14, ey], [ex, ey + 5], [ex + 14, ey], 5, sd + 230 + sx); }
    else { // calm / umursamaz: ağır kapak + yarım ay
      g.fillStyle = INK; g.beginPath(); g.ellipse(ex + sx * 1, ey + 1, 11, 8.5, 0, 0, Math.PI); g.fill();
      inkLine(g, [[ex - 17, ey - 1 + (sx < 0 ? 1 : -1)], [ex + 16, ey + (sx < 0 ? -1 : 1)]], 5.5, sd + 240 + sx);
    }
  }
  // ağız
  const sm = p.smile == null ? 1 : p.smile;
  if (face === 'star') { g.fillStyle = INK; g.beginPath(); g.moveTo(-24, -292); g.quadraticCurveTo(0, -250, 24, -292); g.closePath(); g.fill(); g.fillStyle = '#E0567A'; g.beginPath(); g.ellipse(0, -277, 11, 6, 0, 0, 7); g.fill(); }
  else if (face === 'o' || face === 'O') { g.strokeStyle = INK; g.lineWidth = 4.5; g.beginPath(); g.ellipse(0, -282, 7, 8, 0, 0, 7); g.stroke(); }
  else if (face === 'scared') { g.fillStyle = INK; g.beginPath(); g.ellipse(0, -280, 15, 19, 0, 0, 7); g.fill(); g.fillStyle = '#E0567A'; g.beginPath(); g.ellipse(0, -270, 9, 6, 0, 0, 7); g.fill(); }
  else if (face === 'T') { quadInk(g, [-13, -282], [0, -293], [13, -282], 4.5, sd + 254); }
  else if (face === 'flat') { inkLine(g, [[-14, -288], [14, -288]], 4.5, sd + 255); }
  else if (face === 'x') { inkLine(g, [[-18, -284], [-9, -292], [0, -284], [9, -292], [18, -284]], 4.5, sd + 257); }
  else if (face === 'proud') { quadInk(g, [-17, -292], [2, -276], [18, -298], 5, sd + 256); }
  else if (face === 'angry') { inkLine(g, [[-14, -286], [-5, -292], [4, -286], [13, -292]], 4.5, sd + 251); }
  else if (face === 'sad') { quadInk(g, [-14, -284], [0, -296], [14, -284], 4.5, sd + 252); }
  else if (face === 'sus') { quadInk(g, [-12, -289], [2, -287], [15, -293], 4.5, sd + 253); }
  else quadInk(g, [-15, -290], [0, -290 + 9 * sm], [15, -290 - 1 * sm], 4.5, sd + 250);
  g.restore();
  g.restore();
}

// ---- kol pozları (yerel koordinat; sol kol aynalanır) ----
export function shadow(g, x, y, rx) { g.fillStyle = 'rgba(0,0,0,.38)'; g.beginPath(); g.ellipse(x, y + 2, rx, rx * 0.22, 0, 0, 7); g.fill(); }
export const ARM_UPS = { e: [130, -232], h: [138, -312] };
export const ARM_HIP = { e: [150, -196], h: [96, -150] };
export const ARM_HEAD = { e: [170, -300], h: [92, -420] };
export const ARM_CATCH = { e: [128, -205], h: [138, -232] };
export const ARM_SHRUG = { e: [150, -250], h: [170, -222] };
export const ARM_WAVE = t => ({ e: [130, -232], h: [148, -300 + Math.sin(t * 12) * 26] });
export const ARM_SCARED = { e: [104, -300], h: [84, -392] };
export const ARM_PUNCH = { e: [112, -175], h: [158, -172] };
export function lerpArm(a, b, k) { return { e: [lerp(a.e[0], b.e[0], k), lerp(a.e[1], b.e[1], k)], h: [lerp(a.h[0], b.h[0], k), lerp(a.h[1], b.h[1], k)] }; }

// ---- Mobu yardımcıları ----
// mk(t,x,y,s): nefes alan, göz kırpan varsayılan Mobu nesnesi. (x,y) ayak altı. t = deney süresi (sn).
export function mk(t, x, y, s) {
  return { x, y, gy: y, s, bw: 1.05, bh: 1, sx: 1 - 0.012 * Math.sin(t * 2.2), sy: 1 + 0.014 * Math.sin(t * 2.2), hairBounce: 0.3 * Math.sin(t * 2.2), blink: (t % 3.7) < 0.12 ? 1 : 0, look: 0, smile: 1, face: 'calm' };
}
// yürüme: t = faz (artan sayı; ilerledikçe adım atar), dir ±1 eğim yönü, sp hız çarpanı, amp genlik 0..1.1
export function walk(m, t, dir = 1, sp = 11, amp = 1) {
  const c = Math.sin(t * sp);
  m.legL = [c * 26 * amp, -Math.max(0, c) * 28 * amp]; m.legR = [-c * 26 * amp, -Math.max(0, -c) * 28 * amp];
  m.armL = { e: [128, -190 + c * 22 * amp], h: [135, -118 + c * 28 * amp] }; m.armR = { e: [128, -190 - c * 22 * amp], h: [135, -118 - c * 28 * amp] };
  m.rot = (m.rot || 0) + 0.05 * dir * amp; m.y -= Math.abs(c) * 7 * amp; m.hairBounce = 0.6 * Math.abs(c) * amp;
}
// t0..t1 arasında yay çizen zıplama: y'yi düşürür, bacakları toplar. Dönüş: o anki yükseklik (px, s=1 birimi)
export function hop(m, t, t0, t1, h) {
  if (t < t0 || t >= t1) return 0;
  const u = lin(t, t0, t1); const y = h * 4 * u * (1 - u);
  m.y -= y; m.legL = [-8, -26]; m.legR = [8, -30]; m.hairBounce = 1.4; m.sy *= 1 + 0.07 * Math.sin(Math.PI * u); m.sx *= 1 - 0.04 * Math.sin(Math.PI * u);
  return y;
}
// tl anında iniş ezilmesi (d sn içinde söner)
export function landSq(m, t, tl, amt = 1, d = 0.22) {
  const k = pulse(t, tl, d) * amt;
  m.sy *= 1 - 0.22 * k; m.sx *= 1 + 0.13 * k; m.hairBounce = (m.hairBounce || 0) + 1.2 * k;
}
// K.O. yassılaşma, k 0..1
export function pancake(m, k) { m.sx *= lerp(1, 2.0, k); m.sy *= lerp(1, 0.26, k); }
// gövde etrafında yuvarlanma (dönme noktası gövde merkezi)
export function rollAbout(m, th) { const r = 190 * m.s; m.rot = (m.rot || 0) + th; m.x += -r * Math.sin(th); m.y += r * (Math.cos(th) - 1); }
// elin dünya konumu (side: -1 sol, +1 sağ)
export function handPos(m, side) {
  const bw = m.bw || 1, ax = v => v * (1 + (bw - 1) * 0.85); const a = side > 0 ? (m.armR || ARM_DEF) : (m.armL || ARM_DEF);
  const s = m.s || 1, px = side * ax(a.h[0]) * s * (m.sx || 1), py = (a.h[1] + 6) * s * (m.sy || 1), r = m.rot || 0;
  return [m.x + px * Math.cos(r) - py * Math.sin(r), m.y + px * Math.sin(r) + py * Math.cos(r)];
}
// gölge + Mobu. Gölge m.gy (zemin y) üzerine düşer; yerden yükseldikçe küçülür. m.nosh=true gölgeyi kapatır.
export function drawMobu(g, m, shr = 110) {
  if (m.nosh !== true) shadow(g, m.x, (m.gy != null ? m.gy : m.y) + (m.shy || 0), shr * m.s * (1 - Math.min(0.4, ((m.gy != null ? m.gy : m.y) - m.y) / 900)) * (m.shk || 1));
  mobu(g, m);
}
export { clamp };
