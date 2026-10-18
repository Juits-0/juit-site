// enemy.js — kırmızı düşman, saldırı işareti ve taş golem boss.
// Kaynak: JuitShorts/_kit/lib/extra.js + example07/p1.part (sadeleştirildi).
import { lerp, lerp2, hash, lerpCol } from './math.js';
import { INK, PURPLE, GLOW, RED, RED2, RED3, FONT, drawGroup, ell, inkLine, quadInk, poly, jit, ik, HATCH_R, HATCH_L, getBoil, setBoilRaw } from './ink.js';
import { glowAt } from './fx.js';

// e: {x,y,s,sx,sy,rot,flip,lift,foot, face:'angry'|'furious'|'wait'|'alert'|'confused'|'dizzy'|'happy', lookX}
// (x,y) ayak altı. s=1'de ~165 px boy. i: çizgi tohumu için sıra no (her düşmana farklı ver).
export function enemy(g, e, i = 0) {
  g.save(); g.translate(e.x, e.y - (e.lift || 0)); g.rotate(e.rot || 0); g.scale((e.s || 1) * (e.sx || 1) * (e.flip || 1), (e.s || 1) * (e.sy || 1));
  const sd = 3000 + i * 400, f = e.foot || 0;
  drawGroup(g, [{ pts: ell(-30, -10 - f, 26, 13), fill: RED2, seed: sd }, { pts: ell(30, -10, 26, 13), fill: RED2, seed: sd + 10 }], 4.5);
  drawGroup(g, [{ pts: [[-52, -108], [-62, -162], [-22, -128]], fill: RED, seed: sd + 20 }, { pts: [[52, -108], [62, -162], [22, -128]], fill: RED, seed: sd + 30 }, { pts: ell(0, -72, 66, 62), fill: RED, hatch: HATCH_R, seed: sd + 40 }], 4.5);
  drawGroup(g, [{ pts: ell(0, -46, 36, 20), fill: RED3, seed: sd + 45, noOutline: true }], 4.5);
  const lx = (e.lookX || 0) * 6, face = e.face || 'angry';
  for (const sx of [-1, 1]) {
    const ex = sx * 23, ey = -84;
    if (face === 'dizzy') { inkLine(g, [[ex - 8, ey - 8], [ex + 8, ey + 8]], 4, sd + 50 + sx); inkLine(g, [[ex + 8, ey - 8], [ex - 8, ey + 8]], 4, sd + 55 + sx); continue; }
    if (face === 'happy') { quadInk(g, [ex - 10, ey + 3], [ex, ey - 9], [ex + 10, ey + 3], 4.5, sd + 60 + sx); continue; }
    if (face === 'alert') { g.fillStyle = '#fff'; g.strokeStyle = INK; g.lineWidth = 3.5; g.beginPath(); g.ellipse(ex, ey - 2, 18, 21, 0, 0, 7); g.fill(); g.stroke(); g.fillStyle = INK; g.beginPath(); g.arc(ex + lx * 0.6, ey, 4, 0, 7); g.fill(); quadInk(g, [ex - 14, ey - 30], [ex, ey - 40], [ex + 14, ey - 30], 4.5, sd + 66 + sx); continue; }
    if (face === 'confused') {
      g.fillStyle = '#fff'; g.strokeStyle = INK; g.lineWidth = 3.5; g.beginPath(); g.ellipse(ex, ey, 14, sx < 0 ? 16 : 9, 0, 0, 7); g.fill(); g.stroke(); g.fillStyle = INK; g.beginPath(); g.arc(ex + lx, ey + 2, 5.5, 0, 7); g.fill();
      if (sx < 0) quadInk(g, [ex - 14, ey - 26], [ex, ey - 36], [ex + 14, ey - 28], 4.5, sd + 67); else inkLine(g, [[ex - 12, ey - 16], [ex + 12, ey - 18]], 4.5, sd + 68); continue;
    }
    g.fillStyle = '#fff'; g.strokeStyle = INK; g.lineWidth = 3.5; g.beginPath(); g.ellipse(ex, ey, 14, face === 'furious' ? 12 : 16, 0, 0, 7); g.fill(); g.stroke();
    g.fillStyle = INK; g.beginPath(); g.arc(ex + lx, ey + (face === 'furious' ? 1 : 3), face === 'furious' ? 5.5 : 6.5, 0, 7); g.fill();
    if (face === 'furious') inkLine(g, [[ex - sx * 18, ey - 26], [ex + sx * 12, ey - 10]], 7.5, sd + 64 + sx);
    else if (face === 'angry') inkLine(g, [[ex - sx * 16, ey - 22], [ex + sx * 12, ey - 13]], 5.5, sd + 65 + sx);
    else inkLine(g, [[ex - 12, ey - 20], [ex + 12, ey - 20]], 4.5, sd + 65 + sx);
  }
  if (face === 'furious') { g.fillStyle = '#fff'; g.strokeStyle = INK; g.lineWidth = 3.5; g.beginPath(); g.roundRect(-18, -60, 36, 16, 5); g.fill(); g.stroke(); g.beginPath(); g.moveTo(-18, -52); g.lineTo(18, -52); for (const x of [-8, 1, 10]) { g.moveTo(x, -60); g.lineTo(x, -44); } g.stroke(); }
  else if (face === 'alert') { g.fillStyle = INK; g.beginPath(); g.ellipse(0, -50, 8, 10, 0, 0, 7); g.fill(); }
  else if (face === 'confused') { inkLine(g, [[-12, -50], [-5, -54], [2, -49], [10, -53]], 4, sd + 73); }
  else if (face === 'angry') inkLine(g, [[-12, -50], [-4, -55], [4, -50], [12, -55]], 4, sd + 70);
  else if (face === 'happy') { quadInk(g, [-13, -54], [0, -42], [13, -54], 4.5, sd + 71); }
  else inkLine(g, [[-9, -51], [9, -51]], 4, sd + 72);
  g.restore();
}

// düşmanın üstünde "saldırı hakkı" işareti: zeminde mor halka + üstte mor ünlem tabelası. (x,y) halkanın merkezi, a 0..1
export function marker(g, x, y, t, a = 1) {
  if (a <= 0) return;
  g.save(); g.globalAlpha = a;
  const b = Math.sin(t * 6) * 8;
  g.strokeStyle = PURPLE; g.lineWidth = 5; g.globalAlpha = a * 0.85; g.beginPath(); g.ellipse(x, y, 82, 22, 0, 0, 7); g.stroke();
  g.globalAlpha = a * 0.25; g.fillStyle = PURPLE; g.beginPath(); g.ellipse(x, y, 82, 22, 0, 0, 7); g.fill(); g.globalAlpha = a;
  const yy = y - 215 + b; g.translate(x, yy); g.scale(a, a);
  drawGroup(g, [{ pts: [[-30, -34], [30, -34], [0, 10]], fill: PURPLE, seed: 9100 }], 4);
  g.fillStyle = '#fff'; g.font = `900 34px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('!', 0, -17);
  g.restore();
}

// ================= BOSS (taş golem) =================
const SLATE = '#3A3446', PLATE = '#4E465C', SLATE2 = '#2B2637';
const ARM_L1 = 430, ARM_L2 = 450;   // omuz→dirsek, dirsek→bilek uzunlukları (s=1)
// side ±1. A: {raise 0..1 (kolu kaldır), swing 0..1 (yana yumruk), slam 0..1 (hedefe vur: tx,ty dünya), tr titreme, gl yumruk parlaması}
function bossArmPose(side, A, up, B, bt) {
  const S = up([side * 250, -640]);
  const sway = Math.sin(bt * 1.9 + side) * 6;
  const rest = { e: [side * 350, -400 + sway], f: [side * 372, -150 + sway * 0.5] };
  const raiseP = { e: [side * 392, -700], f: [side * 322, -885] };
  const k1 = A ? A.raise || 0 : 0, k2 = A ? A.slam || 0 : 0;
  let e = lerp2(rest.e, raiseP.e, k1), f = lerp2(rest.f, raiseP.f, k1);
  if (A && A.swing) { e = lerp2(e, [side * 420, -560], A.swing); f = lerp2(f, [side * 470, -380], A.swing); }
  if (A && A.tr) {
    const q = Math.floor((B.rt || 0) * 30);
    e = [e[0] + hash(q + side * 3) * A.tr * 0.6, e[1] + hash(q + side * 3 + 1) * A.tr * 0.6];
    f = [f[0] + hash(q + side * 3 + 2) * A.tr, f[1] + hash(q + side * 3 + 5) * A.tr];
  }
  if (k2 > 0) { const T = [(A.tx - B.x) / B.s, (A.ty - B.y) / B.s - 100]; const r = ik([S[0], S[1]], T, side, ARM_L1, ARM_L2); e = lerp2(e, r.e, k2); f = lerp2(f, r.f, k2); }
  return { S, e, f };
}
// B: {x,y (ayak noktası), s (ölçek, ~1.0 → ~1000 px), bt (idle zamanı), rt (titreme zamanı), boil (opsiyonel sabit boil),
//     red 0..1 (gözler kırmızı), narrow 0..1 (gözler kısık), lean (radyan eğim), drop (gövde çökmesi px), mouth 0..1,
//     crack 0..1 (parlayan çatlaklar), hurt (titreyen kafa), tilt, eyeGlow, eyeOff, armL/armR: kol parametreleri}
// Kollar eklemli zincir: omuz → dirsek → yumruk. Kopuk parça yok.
export function bossDraw(g, B) {
  const s = B.s || 1, bt = B.bt || 0, red = B.red || 0, nar = B.narrow || 0, lean = B.lean || 0, drop = B.drop || 0;
  const sv = getBoil(); if (B.boil != null) setBoilRaw(B.boil);
  const br = Math.sin(bt * 1.9), bobY = br * 5, sy = 1 + 0.010 * br;
  g.save(); g.translate(B.x, B.y); g.scale(s, s);
  const cl = Math.cos(lean), sl = Math.sin(lean);
  const up = p => { const x = p[0], y = (p[1] + 270) * sy; return [x * cl - y * sl, -270 + drop + bobY + x * sl + y * cl]; };
  // bacaklar
  poly(g, [[-250, -300], [-60, -300], [-48, -24], [-70, 0], [-285, 0], [-300, -34]], SLATE, 6000, 5, HATCH_L);
  poly(g, [[250, -300], [60, -300], [48, -24], [70, 0], [285, 0], [300, -34]], SLATE, 6010, 5, HATCH_L);
  poly(g, [[-285, -52], [-120, -52], [-110, -20], [-290, -20]], PLATE, 6020, 4);
  poly(g, [[285, -52], [120, -52], [110, -20], [290, -20]], PLATE, 6030, 4);
  // üst gövde
  g.save(); g.translate(0, -270 + drop + bobY); g.rotate(lean); g.scale(1, sy); g.translate(0, 270);
  poly(g, [[-235, -290], [235, -290], [335, -560], [305, -710], [120, -752], [-120, -752], [-305, -710], [-335, -560]], SLATE, 6100, 5, HATCH_L);
  poly(g, [[-150, -372], [150, -372], [212, -560], [122, -694], [-122, -694], [-212, -560]], PLATE, 6110, 4);
  poly(g, [[-100, -330], [100, -330], [122, -372], [-122, -372]], SLATE2, 6115, 4);
  inkLine(g, [[-160, -470], [160, -470]], 4, 6120); inkLine(g, [[0, -470], [0, -372]], 4, 6121); inkLine(g, [[-120, -600], [120, -600]], 4, 6122);
  // parlayan çatlaklar
  const crk = B.crack == null ? 1 : B.crack, ccol = lerpCol(GLOW, RED, red);
  if (crk > 0) {
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
    const cr = [[[-70, -470], [-34, -526], [-78, -580], [-44, -640]], [[84, -390], [56, -446], [104, -500], [70, -560]], [[-270, -560], [-232, -612], [-262, -660]], [[268, -596], [236, -640], [262, -690]], [[-180, -340], [-150, -300]]];
    cr.forEach((c, i) => {
      const P = jit(c, 6130 + i * 3, 1.4); const path = () => { g.beginPath(); P.forEach((p, j) => j ? g.lineTo(...p) : g.moveTo(...p)); g.stroke(); };
      g.strokeStyle = ccol; g.globalAlpha = 0.28 * crk; g.lineWidth = 17; path();
      g.globalAlpha = crk; g.strokeStyle = INK; g.lineWidth = 11; path();
      g.strokeStyle = ccol; g.lineWidth = 5; path();
    });
    g.restore();
  }
  g.restore();
  // kollar
  const aL = bossArmPose(-1, B.armL, up, B, bt), aR = bossArmPose(1, B.armR, up, B, bt);
  const armsDraw = (A, a, seed) => {
    drawGroup(g, [{ line: [a.S, a.e], w: 156, fill: SLATE, seed }, { line: [a.e, a.f], w: 142, fill: SLATE, seed: seed + 10 }], 5);
    drawGroup(g, [{ pts: ell(a.e[0], a.e[1], 76, 70, 16), fill: PLATE, seed: seed + 20 }], 5);
    const act = A && ((A.raise || 0) > 0 || (A.slam || 0) > 0), sh = act ? 10 : 40;
    const dx = a.f[0] - a.e[0], dy = a.f[1] - a.e[1], ang = Math.atan2(dy, dx) - Math.PI / 2;
    if (act) drawGroup(g, [{ pts: ell(a.S[0], a.S[1], 84, 78, 16), fill: SLATE, seed: seed + 50 }, { pts: ell(a.f[0], a.f[1], 76, 72, 16), fill: PLATE, seed: seed + 60 }], 5);
    g.save(); g.translate(a.f[0], a.f[1]); g.rotate(ang);
    const fg = A ? A.gl || 0 : 0;
    poly(g, [[-92, -70], [92, -70], [108, 10], [92, 100], [-92, 100], [-108, 10]].map(p => [p[0], p[1] + sh]), PLATE, seed + 30, 5, HATCH_L);
    poly(g, [[-80, 70], [80, 70], [84, 130], [-84, 130]].map(p => [p[0], p[1] + sh - 40]), SLATE2, seed + 40, 4);
    inkLine(g, [[-45, 50 + sh - 40], [-45, 110 + sh - 40]], 4, seed + 41); inkLine(g, [[0, 50 + sh - 40], [0, 110 + sh - 40]], 4, seed + 42); inkLine(g, [[45, 50 + sh - 40], [45, 110 + sh - 40]], 4, seed + 43);
    if (fg > 0) {
      g.save(); g.strokeStyle = lerpCol(GLOW, RED, fg); g.lineWidth = 7; g.lineCap = 'round'; g.globalAlpha = 0.9;
      for (const c of [[[-70, -10], [-30, 30], [-60, 70]], [[60, 0], [30, 40], [64, 86]]]) { g.beginPath(); c.forEach((p, i) => i ? g.lineTo(p[0], p[1] + sh) : g.moveTo(p[0], p[1] + sh)); g.stroke(); }
      g.restore();
    }
    g.restore();
    if (fg > 0) glowAt(g, a.f[0] - Math.sin(ang) * 50, a.f[1] + Math.cos(ang) * 50, 300, '239,74,92', 0.75 * fg);
  };
  armsDraw(B.armL, aL, 6200); armsDraw(B.armR, aR, 6300);
  // omuz taşları ve kafa
  g.save(); g.translate(0, -270 + drop + bobY); g.rotate(lean); g.scale(1, sy); g.translate(0, 270);
  poly(g, [[-440, -650], [-392, -762], [-262, -758], [-232, -640], [-300, -566], [-424, -580]], PLATE, 6400, 5, HATCH_L);
  poly(g, [[440, -650], [392, -762], [262, -758], [232, -640], [300, -566], [424, -580]], PLATE, 6410, 5, HATCH_L);
  const hb = Math.sin(bt * 1.9 + 0.6) * 4 + (B.hurt ? Math.sin(B.hurt * 50) * 6 : 0);
  g.save(); g.translate(0, hb); g.translate(0, -780); g.rotate(B.tilt || 0); g.translate(0, 780);
  poly(g, [[-112, -756], [112, -756], [140, -846], [104, -932], [-104, -932], [-140, -846]], SLATE, 6500, 5, HATCH_L);
  poly(g, [[-86, -900], [86, -900], [98, -868], [-98, -868]], PLATE, 6510, 4);
  poly(g, [[-134, -858], [134, -858], [112, -820], [-112, -820]], SLATE2, 6520, 4);
  const mo = B.mouth || 0;
  if (mo > 0) poly(g, [[-52, -790], [52, -790], [44, -790 + 14 + 22 * mo], [-44, -790 + 14 + 22 * mo]], '#120E18', 6530, 3);
  else inkLine(g, [[-54, -780], [54, -780]], 4, 6531);
  for (const x of [-34, -12, 12, 34]) inkLine(g, [[x, -790], [x, -768]], 3.2, 6540 + x);
  const ecol = lerpCol(GLOW, RED, red), eh = lerp(20, 9, nar), sl2 = lerp(0, 8, Math.max(nar, red * 0.6));
  const eg = B.eyeGlow == null ? 1 : B.eyeGlow;
  if (eg > 0) {
    for (const sx of [-1, 1]) {
      const ex = sx * 54, ey = -838 + (B.eyeOff || 0);
      glowAt(g, ex, ey, 120, red > 0.2 ? '239,74,92' : '182,124,255', 0.55 * eg);
      g.fillStyle = ecol; g.strokeStyle = INK; g.lineWidth = 3.5; g.lineJoin = 'round'; g.globalAlpha = eg;
      g.beginPath(); g.moveTo(ex - sx * 38, ey - eh / 2); g.lineTo(ex + sx * 38, ey - eh / 2 + sl2); g.lineTo(ex + sx * 38, ey + eh / 2 + sl2); g.lineTo(ex - sx * 38, ey + eh / 2); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#fff'; g.globalAlpha = 0.55 * eg; g.fillRect(ex - sx * 22 - 6, ey - 1 + sl2 * 0.25, 12, 3); g.globalAlpha = 1;
    }
  }
  g.restore(); g.restore();
  g.restore(); setBoilRaw(sv);
}
