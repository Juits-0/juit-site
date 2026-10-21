// hitbox.js — #09 "Oyunlarda ıskaladığın hâlde nasıl vuruyorsun?"
// İki ayrı kavram: (1) HITBOX PAYI = hedefin görünmeyen çarpışma kutusu, (2) NİŞAN YARDIMI = atış açısını hedefe doğru döndürür.
import { Experiment } from '../core/experiment.js';
import { clamp, lin, lerp, eOut, eBack, pulse, rng, angDiff } from '../core/math.js';
import { INK, PURPLE, GLOW, LAV, RED, GOLD, setBoil } from '../core/ink.js';
import { mk, drawMobu, handPos, hop, ARM_DEF, ARM_HIP } from '../core/mobu.js';
import { enemy } from '../core/enemy.js';
import { Particles, glowAt } from '../core/fx.js';
import { txt, txtInk, pill, roundBox } from '../core/ui.js';

const S = 0.3;                         // Mobu ölçeği
const GY = 500;                        // zemin (ayak altı) y
const GOAL = 10;                       // hedef vuruş sayısı
const MUZ = 44;                        // tabancada elden namlu ucuna uzaklık
const COOL = 0.2;                      // atış arası
const RESPAWN = 0.6;                   // vuruştan sonra yeni hedef gecikmesi
const TS = [0.9, 0.75, 0.6];           // yakın / orta / uzak kukla ölçeği
const A_MIN = -80 * Math.PI / 180, A_MAX = 40 * Math.PI / 180;
const DEG = 180 / Math.PI;

// ---- ışın testleri (dünya piksel uzayı, t = ışın boyunca uzaklık) ----
function rayEll(ox, oy, dx, dy, cx, cy, rx, ry) {
  const px = (ox - cx) / rx, py = (oy - cy) / ry, vx = dx / rx, vy = dy / ry;
  const A = vx * vx + vy * vy, B = 2 * (px * vx + py * vy), C = px * px + py * py - 1, D = B * B - 4 * A * C;
  if (D < 0) return null;
  const sq = Math.sqrt(D), t1 = (-B - sq) / (2 * A), t2 = (-B + sq) / (2 * A);
  return t2 < 0 ? null : Math.max(t1, 0);
}
function raySeg(ox, oy, dx, dy, ax, ay, bx, by) {
  const ex = bx - ax, ey = by - ay, den = dx * ey - dy * ex;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((ax - ox) * ey - (ay - oy) * ex) / den, u = ((ax - ox) * dy - (ay - oy) * dx) / den;
  return t >= 0 && u >= 0 && u <= 1 ? t : null;
}
function rayRect(ox, oy, dx, dy, x0, y0, x1, y1) {
  let tmin = -Infinity, tmax = Infinity;
  for (const [o, d, lo, hi] of [[ox, dx, x0, x1], [oy, dy, y0, y1]]) {
    if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return null; continue; }
    let a = (lo - o) / d, b = (hi - o) / d; if (a > b) [a, b] = [b, a];
    tmin = Math.max(tmin, a); tmax = Math.min(tmax, b);
  }
  return tmax < 0 || tmin > tmax ? null : Math.max(tmin, 0);
}
const minNN = arr => { let m = null; for (const v of arr) if (v != null && (m == null || v < m)) m = v; return m; };

export default class Hitbox extends Experiment {
  static id = 'hitbox';
  static kind = '2d';
  static controls = {
    joystick: false, buttons: [{ name: 'action', label: 'ATEŞ' }], pointer: 'aim',
    hint: 'Fare: nişan al · Tık ya da E: ateş',
    hintTouch: 'Sürükle: nişan al · Bırak ya da ATEŞ: ateş',
  };
  static settings = [
    { key: 'pad', label: 'Hitbox payı', type: 'range', value: 12, min: 0, max: 40, step: 2, unit: 'px', group: 'Hitbox' },
    { key: 'showHitbox', label: "Hitbox'ı göster", type: 'toggle', value: false, group: 'Hitbox' },
    { key: 'assist', label: 'Yardım gücü', type: 'range', value: 0, min: 0, max: 1, step: 0.1, group: 'Nişan yardımı' },
    { key: 'assistCone', label: 'Yardım konisi', type: 'range', value: 8, min: 2, max: 20, step: 1, unit: '°', group: 'Nişan yardımı' },
    { key: 'pad0', label: 'Pay 0 · yardım 0', type: 'button', group: 'Karşılaştır' },
    { key: 'pad20', label: 'Pay 20 · yardım 0', type: 'button', group: 'Karşılaştır' },
    { key: 'assist1', label: 'Pay 0 · yardım 1', type: 'button', group: 'Karşılaştır' },
  ];

  init() {
    this.parts = new Particles(260);
    this.reset();
  }

  reset() {
    this.parts.clear();
    this.rnd = rng(9);
    this.shots = []; this.marks = [];
    this.nModel = 0; this.nBox = 0; this.nMiss = 0;
    this.lastShot = null; this.fireT = -9; this.react = null; this.lastAimT = -9; this.doneT = -1; this.hinted = false;
    this.aimA = 0; this.aimGoal = 0; this.pivotCache = null;
    this.tg = null;
    this._spawn(0, 0);
    this.aimA = this.aimGoal = this._angToTarget();
    this.hud(null);
  }

  onSetting(key) {
    const set = (pad, assist, msg) => { this.setSetting('pad', pad); this.setSetting('assist', assist); this._zero(); this.toast(msg, 1600); };
    if (key === 'pad0') set(0, 0, 'Pay 0 · yardım 0: sayaçlar sıfırlandı');
    else if (key === 'pad20') set(20, 0, 'Pay 20 · yardım 0: sayaçlar sıfırlandı');
    else if (key === 'assist1') set(0, 1, 'Pay 0 · yardım 1: sayaçlar sıfırlandı');
  }
  _zero() { this.nModel = this.nBox = this.nMiss = 0; this.lastShot = null; this.shots.length = 0; this.marks.length = 0; this.doneT = -1; }

  get hits() { return this.nModel + this.nBox; }
  get mx() { return clamp(this.view.w * 0.18, 70, 230); }

  // ---------------- hedef ----------------
  _tpos(idx) {
    const W = this.view.w, mx = this.mx, near = mx + 215, far = Math.min(W - 60, mx + 780);
    return [near, (near + far) / 2, far][idx];
  }
  _spawn(T, idx) {
    this.tg = { idx, s: TS[idx], x: this._tpos(idx), state: 'idle', spawnT: T, hitT: -9, ph: this.rnd() * 6.28, fallDir: 1, face: 'wait', swayX: 0 };
  }
  _tx(T) { const t = this.tg; return t.state === 'idle' ? this._tpos(t.idx) + Math.sin(T * 1.7 + t.ph) * 10 : t.swayX; }
  _sk(T) { const t = this.tg; return t.state === 'idle' ? Math.max(0.15, eBack(lin(T - t.spawnT, 0, 0.3))) : 1; }
  // görünen model (elips + üçgenler) ve sınır kutusu — enemy.js çizimiyle aynı geometri
  _shape(T) {
    const t = this.tg, s = t.s * this._sk(T), x = this._tx(T), y = GY;
    const E = (cx, cy, rx, ry) => ({ k: 'e', cx: x + cx * s, cy: y + cy * s, rx: rx * s, ry: ry * s });
    const Tr = pts => ({ k: 't', pts: pts.map(([px, py]) => [x + px * s, y + py * s]) });
    const prims = [E(0, -72, 66, 62), E(-30, -10, 26, 13), E(30, -10, 26, 13), Tr([[-52, -108], [-62, -162], [-22, -128]]), Tr([[52, -108], [62, -162], [22, -128]])];
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const p of prims) {
      if (p.k === 'e') { x0 = Math.min(x0, p.cx - p.rx); x1 = Math.max(x1, p.cx + p.rx); y0 = Math.min(y0, p.cy - p.ry); y1 = Math.max(y1, p.cy + p.ry); }
      else for (const [px, py] of p.pts) { x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py); }
    }
    const pd = this.s.pad;
    return { prims, bb: { x0, y0, x1, y1 }, hb: { x0: x0 - pd, y0: y0 - pd, x1: x1 + pd, y1: y1 + pd }, s, x };
  }
  _angToTarget() {
    const sh = this._shape(this.time), pv = this._pivot(0);
    return clamp(Math.atan2((sh.bb.y0 + sh.bb.y1) / 2 - pv[1], (sh.bb.x0 + sh.bb.x1) / 2 - pv[0]), A_MIN, A_MAX);
  }

  // ---------------- Mobu ----------------
  _mobu(T, a) {
    const m = mk(T, this.mx, GY, S), u = clamp(-a / 1.0, -1, 1), rc = pulse(T, this.fireT, 0.16);
    m.armR = { e: [112 + rc * -6, -175 - u * 45], h: [158 - rc * 14, -172 - u * 95] };
    m.armL = ARM_HIP;
    m.look = 1;
    const r = this.react;
    if (r && T - r.t0 < r.d) {
      const k = pulse(T, r.t0, r.d);
      if (r.kind === 'model') { m.face = 'star'; hop(m, T, r.t0, r.t0 + 0.32, 14); }
      else if (r.kind === 'box') { m.face = 'o'; m.sx *= 1 + 0.06 * k; m.sy *= 1 - 0.04 * k; m.rot = (m.rot || 0) - 0.07 * k; }
      else { m.face = 'sad'; m.sy *= 1 - 0.05 * k; m.rot = (m.rot || 0) + 0.05 * k; }
    } else if (T - this.lastAimT < 1.6) m.face = 'sus';
    else { m.face = 'calm'; m.look = 0.5; }
    return m;
  }
  _pivot(a) { return handPos(this._mobu(this.time, a), 1); }

  // ---------------- atış ----------------
  _rawAngle(px, py) {                      // işaretçi → ham açı (elin konumu açıya bağlı: sabit nokta yinelemesi)
    let a = this.aimA;
    for (let i = 0; i < 3; i++) { const pv = this._pivot(a); a = clamp(Math.atan2(py - pv[1], px - pv[0]), A_MIN, A_MAX); }
    return a;
  }
  _solveAssist(T, a0) {
    const sh = this._shape(T), cx = (sh.bb.x0 + sh.bb.x1) / 2, cy = (sh.bb.y0 + sh.bb.y1) / 2;
    const cone = this.s.assistCone / DEG, as = this.s.assist;
    const toC = a => { const pv = this._pivot(a); return Math.atan2(cy - pv[1], cx - pv[0]); };
    if (as <= 0 || Math.abs(angDiff(a0, toC(a0))) > cone) return a0;
    let a1 = a0;
    for (let i = 0; i < 3; i++) a1 = a0 + angDiff(a0, toC(a1)) * as;
    return a1;
  }
  // sınıflandırma (saf): ışın muzzle'dan a yönünde → {kind, t}
  _classify(ox, oy, a, T) {
    const sh = this._shape(T), dx = Math.cos(a), dy = Math.sin(a);
    const tv = minNN(sh.prims.map(p => p.k === 'e' ? rayEll(ox, oy, dx, dy, p.cx, p.cy, p.rx, p.ry)
      : minNN([0, 1, 2].map(i => raySeg(ox, oy, dx, dy, p.pts[i][0], p.pts[i][1], p.pts[(i + 1) % 3][0], p.pts[(i + 1) % 3][1])))));
    if (tv != null) return { kind: 'model', t: tv };
    const tb = rayRect(ox, oy, dx, dy, sh.hb.x0, sh.hb.y0, sh.hb.x1, sh.hb.y1);
    return tb != null ? { kind: 'box', t: tb } : { kind: 'miss', t: null };
  }
  _fire(T, a0) {
    const tg = this.tg;
    if (this.completed || !tg || tg.state !== 'idle' || T - this.fireT < COOL || this.hits >= GOAL) return false;
    const a1 = this._solveAssist(T, a0);
    this.fireT = T; this.aimA = a1; this.lastAimT = T;
    const pv = this._pivot(a1), dx = Math.cos(a1), dy = Math.sin(a1), ox = pv[0] + dx * MUZ, oy = pv[1] + dy * MUZ;
    const c = this._classify(ox, oy, a1, T), len = c.t != null ? c.t : 2400;
    const ix = ox + dx * len, iy = oy + dy * len;
    this.audio.play('laser');
    const sh = { t0: T, ox, oy, a0, a1, len, kind: c.kind, ix, iy };
    this.shots.push(sh);
    this.lastShot = { a0, a1, kind: c.kind };
    if (c.kind === 'miss') {
      this.nMiss++; this.react = { kind: 'miss', t0: T, d: 0.5 };
      this.marks.push({ t0: T, x: clamp(ox + 120, 60, this.view.w - 60), y: oy - 40, kind: 'miss' });
    } else {
      const box = c.kind === 'box';
      if (box) this.nBox++; else this.nModel++;
      tg.swayX = this._tx(T); tg.state = 'fall'; tg.hitT = T; tg.fallDir = 1; tg.face = box ? 'confused' : 'dizzy';
      this.react = box ? { kind: 'box', t0: T, d: 0.9 } : { kind: 'model', t0: T, d: 0.55 };
      this.audio.play('hit'); this.shake(3);
      this.parts.sparks(ix, iy, this.reduced ? 4 : 10, box ? RED : GLOW);
      if (!box && !this.reduced) this.parts.stars(tg.swayX, GY - 140 * tg.s, 3);
      this.marks.push({ t0: T, x: tg.swayX, y: GY - 190 * tg.s - 10, kind: c.kind });
      if (box && !this.hinted) { this.hinted = true; this.toast('Modele değmedi ama sayıldı: görünmeyen kutu', 2400); }
      if (this.hits >= GOAL) this.doneT = T;
    }
    return true;
  }

  // ---------------- güncelleme ----------------
  update(dt) {
    const T = this.time, inp = this.input, P = inp.pointer, tg = this.tg;
    this.parts.update(dt);
    this.shots = this.shots.filter(s => T - s.t0 < 1.2);
    this.marks = this.marks.filter(m => T - m.t0 < 1.2);
    if (tg.state === 'fall' && T - tg.hitT > RESPAWN && this.hits < GOAL) {       // yeni konumda belir
      let idx = (tg.idx + 1 + Math.floor(this.rnd() * 2)) % 3;
      this._spawn(T, idx); this.audio.play('pop'); this.parts.dust(this._tpos(idx), GY, 5);
    }
    if (this.completed) { this._hud(); return; }
    // nişan
    const touch = P.type === 'touch', usePtr = P.x > -900 && (touch ? (P.down || P.released) : (P.inside || P.down));
    if (usePtr) {
      if (P.pressed || Math.abs(P.dx) + Math.abs(P.dy) > 0 || (touch && P.down)) this.lastAimT = T;
      this.aimGoal = this._rawAngle(P.x, P.y);
    }
    this.aimA += (this.aimGoal - this.aimA) * (1 - Math.exp(-40 * dt));
    // ateş
    if ((usePtr && ((!touch && P.pressed) || (touch && P.released))) || inp.pressed('action')) this._fire(T, usePtr ? this.aimGoal : this.aimGoal);
    if (this.doneT >= 0 && T - this.doneT > 1.0 && !this.completed) this.complete({ text: this.cfg.lesson });
    this._hud();
  }

  _hud() {
    if (!this.tech) { this.hud(null); return; }
    const L = this.lastShot, deg = a => (-a * DEG).toFixed(1);
    this.hud({
      left: [`Modele isabet: ${this.nModel} · Hitbox isabet: ${this.nBox} · Iska: ${this.nMiss}`,
        L ? `Son atış: ham ${deg(L.a0)}° → düzeltilmiş ${deg(L.a1)}° (+${(Math.abs(L.a1 - L.a0) * DEG).toFixed(1)}°)` : 'Son atış: —'],
      right: [`Pay: ${this.s.pad} px`],
    });
  }

  // ---------------- çizim ----------------
  render(g) {
    const W = this.view.w, H = this.view.h, T = this.time;
    setBoil(T);
    this._bg(g, W, H, T);
    const tg = this.tg, boxOn = this.tech || this.s.showHitbox;
    // tech: yardım konisi
    if (this.tech && this.s.assist > 0 && tg.state === 'idle') this._cone(g, T);
    this._target(g, T);
    if (boxOn) this._boxes(g, T, tg.state === 'idle' ? 1 : 1 - lin(T - tg.hitT, 0.2, RESPAWN));
    // Mobu + tabanca (Mobu'dan sonra)
    const m = this._mobu(T, this.aimA);
    drawMobu(g, m);
    const pv = handPos(m, 1);
    this._gun(g, pv[0], pv[1], this.aimA, T);
    this._shots(g, T, boxOn);
    this.parts.draw(g);
    this._marks(g, T);
    // "?" (hitbox'a isabet, model ıska)
    const r = this.react;
    if (r && r.kind === 'box' && T - r.t0 < r.d) {
      const u = T - r.t0, k = eBack(lin(u, 0, 0.25)), al = 1 - lin(u, 0.65, 0.9);
      g.save(); g.globalAlpha = al; g.translate(m.x + 46, m.y - 168 - Math.sin(u * 7) * 3); g.scale(k, k); g.rotate(0.12);
      txtInk(g, '?', 0, 0, 34, GOLD, 'center', 900); g.restore();
    }
    this._cursor(g);
    this._topHud(g, W);
    const v = g.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, Math.max(W, H) * 0.7);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(60,20,120,.38)'); g.fillStyle = v; g.fillRect(0, 0, W, H);
  }

  _bg(g, W, H) {
    const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#0d0a14'); gr.addColorStop(0.8, '#150f20'); gr.addColorStop(1, '#0a0810');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    glowAt(g, W * 0.55, H * 0.5, 380, '139,61,255', 0.07);
    // zemin
    g.fillStyle = '#1b1430'; g.fillRect(0, GY, W, H - GY);
    g.fillStyle = '#3d3556'; g.fillRect(0, GY, W, 8);
    g.fillStyle = 'rgba(182,124,255,.55)'; g.fillRect(0, GY, W, 2.5);
  }

  _target(g, T) {
    const t = this.tg, s = t.s * this._sk(T), x = this._tx(T);
    let rot = 0, al = 1, sy = 1;
    if (t.state === 'fall') {
      const u = T - t.hitT;
      rot = eOut(lin(u, 0.12, 0.42)) * 1.45 * t.fallDir; al = 1 - lin(u, 0.4, RESPAWN); sy = 1 - 0.1 * lin(u, 0.3, 0.5);
    }
    g.save(); g.globalAlpha = al * 0.35; g.fillStyle = '#000'; g.beginPath(); g.ellipse(x, GY + 3, 58 * s, 10 * s, 0, 0, 7); g.fill(); g.restore();
    g.save(); g.globalAlpha = al;
    enemy(g, { x, y: GY, s, rot, sy, face: t.state === 'idle' ? 'wait' : t.face, lookX: -1 }, 1);
    g.restore();
  }

  _boxes(g, T, al = 1) {
    const sh = this._shape(T), { hb } = sh;
    g.save(); g.globalAlpha = al; g.lineWidth = 1.2; g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineJoin = 'round';
    for (const p of sh.prims) {
      g.beginPath();
      if (p.k === 'e') g.ellipse(p.cx, p.cy, p.rx, p.ry, 0, 0, 7); else { g.moveTo(p.pts[0][0], p.pts[0][1]); g.lineTo(p.pts[1][0], p.pts[1][1]); g.lineTo(p.pts[2][0], p.pts[2][1]); g.closePath(); }
      g.stroke();
    }
    g.strokeStyle = RED; g.lineWidth = 1.4; g.strokeRect(hb.x0, hb.y0, hb.x1 - hb.x0, hb.y1 - hb.y0);
    g.restore();
  }

  _cone(g, T) {
    const sh = this._shape(T), cx = (sh.bb.x0 + sh.bb.x1) / 2, cy = (sh.bb.y0 + sh.bb.y1) / 2, pv = this._pivot(this.aimA);
    const aT = Math.atan2(cy - pv[1], cx - pv[0]), c = this.s.assistCone / DEG, L = Math.hypot(cx - pv[0], cy - pv[1]) + 70;
    g.save(); g.fillStyle = 'rgba(139,61,255,.10)'; g.strokeStyle = 'rgba(182,124,255,.35)'; g.lineWidth = 1; g.setLineDash([4, 5]);
    g.beginPath(); g.moveTo(pv[0], pv[1]); g.lineTo(pv[0] + Math.cos(aT - c) * L, pv[1] + Math.sin(aT - c) * L);
    g.arc(pv[0], pv[1], L, aT - c, aT + c); g.closePath(); g.fill(); g.stroke(); g.restore();
  }

  _gun(g, px, py, a, T) {
    g.save(); g.translate(px, py); g.rotate(a); g.lineJoin = 'round'; g.strokeStyle = INK; g.lineWidth = 3.4;
    g.fillStyle = '#3d3556'; g.beginPath(); g.moveTo(-7, 4); g.lineTo(5, 4); g.lineTo(3, 20); g.lineTo(-9, 20); g.closePath(); g.fill(); g.stroke();   // kabza
    g.fillStyle = '#5b5478'; g.beginPath(); g.roundRect(-9, -9, 36, 16, 4); g.fill(); g.stroke();                                                  // gövde
    g.fillStyle = '#8f88ab'; g.beginPath(); g.roundRect(26, -6, 16, 10, 2); g.fill(); g.stroke();                                                  // namlu
    g.fillStyle = PURPLE; g.beginPath(); g.arc(MUZ - 2, -1, 4.4, 0, 7); g.fill(); g.stroke();                                                       // emitter
    g.restore();
    const k = 1 - lin(T - this.fireT, 0, 0.12), mx = px + Math.cos(a) * MUZ, my = py + Math.sin(a) * MUZ;
    glowAt(g, mx, my, 16 + 34 * k, '182,124,255', 0.35 + 0.55 * k);
  }

  _shots(g, T, boxOn) {
    const life = boxOn ? 0.6 : 0.14;
    for (const s of this.shots) {
      const age = T - s.t0; if (age > life) continue;
      const a = 1 - age / life, ex = s.ox + Math.cos(s.a1) * s.len, ey = s.oy + Math.sin(s.a1) * s.len;
      g.save(); g.lineCap = 'round';
      g.strokeStyle = `rgba(182,124,255,${0.4 * a})`; g.lineWidth = 7; g.beginPath(); g.moveTo(s.ox, s.oy); g.lineTo(ex, ey); g.stroke();
      g.strokeStyle = `rgba(255,255,255,${a})`; g.lineWidth = 2.2; g.stroke();
      if (this.tech) {
        // ham ışın: gri kesikli
        const rx = s.ox + Math.cos(s.a0) * s.len, ry = s.oy + Math.sin(s.a0) * s.len;
        g.setLineDash([6, 5]); g.strokeStyle = `rgba(200,200,215,${0.75 * a})`; g.lineWidth = 1.3; g.beginPath(); g.moveTo(s.ox, s.oy); g.lineTo(rx, ry); g.stroke(); g.setLineDash([]);
        const d = Math.abs(s.a1 - s.a0) * DEG;
        if (d > 0.05) {                                          // düzeltme yayı + etiket
          const R = 70, mid = (s.a0 + s.a1) / 2;
          g.strokeStyle = `rgba(233,221,255,${a})`; g.lineWidth = 2; g.beginPath(); g.arc(s.ox, s.oy, R, Math.min(s.a0, s.a1), Math.max(s.a0, s.a1)); g.stroke();
          g.globalAlpha = a; txtInk(g, `+${d.toFixed(1)}°`, s.ox + Math.cos(mid) * (R + 26), s.oy + Math.sin(mid) * (R + 26) - 12, 13, LAV, 'center', 800); g.globalAlpha = 1;
        }
      }
      if (boxOn && s.kind !== 'miss') {                           // gerçek çarpışma noktası ✕
        g.strokeStyle = s.kind === 'box' ? RED : '#fff'; g.lineWidth = 2.2; g.beginPath();
        g.moveTo(s.ix - 5, s.iy - 5); g.lineTo(s.ix + 5, s.iy + 5); g.moveTo(s.ix + 5, s.iy - 5); g.lineTo(s.ix - 5, s.iy + 5); g.stroke();
      }
      g.restore();
    }
  }

  _marks(g, T) {
    if (!this.tech) return;
    for (const m of this.marks) {
      const a = T - m.t0, k = eBack(lin(a, 0, 0.2)), y = m.y - 20 * eOut(lin(a, 0, 0.9)), al = 1 - lin(a, 0.6, 1.1);
      g.save(); g.globalAlpha = al; g.translate(m.x, y); g.scale(k, k);
      if (m.kind === 'model') pill(g, 'MODELE İSABET', 0, 0, PURPLE, 12);
      else if (m.kind === 'box') pill(g, 'HİTBOX İSABET · MODEL ISKA', 0, 0, '#C7304A', 12);
      else pill(g, 'ISKA', 0, 0, '#4a4466', 12);
      g.restore();
    }
  }

  _cursor(g) {
    const P = this.input.pointer;
    if (P.type === 'touch' || !P.inside || P.x < -900 || this.completed) return;
    g.save(); g.strokeStyle = 'rgba(233,221,255,.9)'; g.lineWidth = 1.6; g.beginPath(); g.arc(P.x, P.y, 8, 0, 7); g.stroke();
    g.beginPath(); g.moveTo(P.x - 14, P.y); g.lineTo(P.x - 4, P.y); g.moveTo(P.x + 4, P.y); g.lineTo(P.x + 14, P.y); g.moveTo(P.x, P.y - 14); g.lineTo(P.x, P.y - 4); g.moveTo(P.x, P.y + 4); g.lineTo(P.x, P.y + 14); g.stroke(); g.restore();
  }

  _topHud(g, W) {
    const cx = W - 92, cy = W < 700 ? 100 : 34, n = Math.min(this.hits, GOAL);
    roundBox(g, cx, cy, 160, 44, 12, 'rgba(23,23,23,.82)', 'rgba(139,61,255,.6)', 2);
    txt(g, `VURUŞ ${n}/${GOAL}`, cx, cy - 8, 15, LAV, 'center', 900);
    for (let i = 0; i < GOAL; i++) { g.fillStyle = i < n ? PURPLE : 'rgba(255,255,255,.16)'; g.beginPath(); g.arc(cx - 63 + i * 14, cy + 11, 4, 0, 7); g.fill(); }
  }
}
