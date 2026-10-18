// sirayla.js — #01 "Düşmanlar neden sırayla saldırıyor?"
// Üstten bakışlı arena: Mobu 20 sn hayatta kalmaya çalışır. Saldırı sırası (token) açıkken en fazla
// `maxAtk` düşman saldırır, diğerleri Mobu'nun çevresindeki halka slotlarında bekler.
import { Experiment } from '../core/experiment.js';
import { clamp, lin, lerp, eOut, eBack, rng } from '../core/math.js';
import { INK, PURPLE, GLOW, LAV, RED, GOLD, setBoil } from '../core/ink.js';
import { mk, walk, pancake, drawMobu, ARM_HIP, ARM_DEF, ARM_SCARED, lerpArm } from '../core/mobu.js';
import { enemy, marker } from '../core/enemy.js';
import { Particles, starPoly } from '../core/fx.js';
import { txt, bar, hearts, pill } from '../core/ui.js';

// ---- sabitler (px, sn) ----
const MS = 0.3, ES = 0.8;                 // Mobu / düşman ölçeği
const MOBU_SPD = 220, EN_SPD = 150;
const ATK_RANGE = 95, HIT_R = 52;         // saldırı başlama mesafesi, temas yarıçapı
const PREP = 0.35, LUNGE = 0.2, REST = 1.2, LUNGE_SPD = 520, RECOIL = 16;
const RING_R = 170, SURVIVE = 20, HEARTS = 5, INVULN = 0.5, SEED = 20260101;
const SEP = 40;                           // düşmanlar arası min. mesafe

export default class Sirayla extends Experiment {
  static id = 'sirayla';
  static kind = '2d';
  static controls = {
    joystick: true, buttons: [], pointer: null,
    hint: 'WASD ya da oklar: koş · 20 saniye hayatta kal',
    hintTouch: 'Joystick: koş',
  };
  static settings = [
    { key: 'queue', label: 'Saldırı sırası', type: 'toggle', value: true, group: 'Düşmanlar' },
    { key: 'enemies', label: 'Düşman sayısı', type: 'range', value: 6, min: 3, max: 12, step: 1, group: 'Düşmanlar' },
    { key: 'maxAtk', label: 'Aynı anda saldıran', type: 'range', value: 2, min: 1, max: 4, step: 1, group: 'Düşmanlar' },
    { key: 'tryOff', label: 'Sırasız dene', type: 'button', group: 'Karşılaştır' },
    { key: 'tryOn', label: 'Sıralı dene', type: 'button', group: 'Karşılaştır' },
  ];

  init() {
    this.parts = new Particles(160);
    this.en = [];
    this.reset();
  }

  // ---- arena dikdörtgeni ----
  _arena() {
    const W = this.view.w, H = this.view.h;
    const aw = Math.min(W - 24, 760), x0 = (W - aw) / 2, y0 = 52, y1 = H - 12;
    return { x0, x1: x0 + aw, y0, y1, cx: x0 + aw / 2, cy: (y0 + y1) / 2 + 20 };
  }
  _clamp(o, padX = 26) {
    const A = this._arena();
    o.x = clamp(o.x, A.x0 + padX, A.x1 - padX);
    o.y = clamp(o.y, A.y0 + 44, A.y1 - 6);
  }

  reset() {
    const A = this._arena(), n = this.s.enemies | 0, r = rng(SEED);
    this.parts.clear();
    this.t = 0; this.st = 'play'; this.stT = 0; this.hp = HEARTS; this.hits = 0; this.invuln = 0; this.hitT = -9;
    this.mx = A.cx; this.my = A.cy; this.kx = 0; this.ky = 0; this.mdir = 1; this.phase = 0; this.speed = 0;
    this.lastSec = SURVIVE + 1; this.fear = 0;
    // düşmanlar: eşit açılı halka + deterministik sapma, hep aynı seed
    this.en = [];
    const a0 = r() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * Math.PI * 2 + (r() - 0.5) * 0.3, d = 230 + r() * 40;
      const e = { i, x: this.mx + Math.cos(a) * d, y: this.my + Math.sin(a) * d * 0.9, st: 'chase', t: 0, token: false, slot: -1,
        dir: 1, ax: 0, ay: 0, ox: 0, oy: 0, lift: 0, hx: 0, hy: 0 };
      this._clamp(e); this.en.push(e);
    }
    this.slotOwner = new Array(n).fill(-1);
    this._assignTokens();
    this.hud(null);
  }

  onSetting(key) {
    if (key === 'tryOff') { this.setSetting('queue', false); this.reset(); this.toast('Sıra kapalı: hepsi birden saldırıyor'); }
    else if (key === 'tryOn') { this.setSetting('queue', true); this.reset(); this.toast('Sıra açık: sadece birkaçı saldırıyor'); }
    else if (key === 'queue' || key === 'enemies') { if (this.en) this.reset(); }
    else if (key === 'maxAtk') { /* canlı geçerli */ }
  }

  _slotPos(k) {
    const n = this.en.length, a = -Math.PI / 2 + Math.PI / n + (k / n) * Math.PI * 2;
    const p = { x: this.mx + Math.cos(a) * RING_R, y: this.my + Math.sin(a) * RING_R * 0.85, a };
    this._clamp(p);
    return p;
  }

  // ---- saldırı hakkı dağıtımı ----
  _assignTokens() {
    const E = this.en;
    if (!this.s.queue) {                     // kapalı: herkes kovalar ve saldırır
      for (const e of E) { if (e.slot >= 0) { this.slotOwner[e.slot] = -1; e.slot = -1; } if (e.st === 'slot') e.st = 'chase'; e.token = e.st !== 'rest'; }
      return;
    }
    let holders = 0;
    for (const e of E) if (e.token && (e.st === 'chase' || e.st === 'prep' || e.st === 'lunge')) holders++;
    let avail = this.s.maxAtk - holders;
    if (avail > 0) {
      const cand = E.filter(e => !e.token && (e.st === 'chase' || e.st === 'slot'))
        .sort((a, b) => Math.hypot(a.x - this.mx, a.y - this.my) - Math.hypot(b.x - this.mx, b.y - this.my));
      for (const e of cand) {
        if (avail <= 0) break;
        e.token = true; avail--;
        if (e.slot >= 0) { this.slotOwner[e.slot] = -1; e.slot = -1; }
        e.st = 'chase';
      }
    }
    // hakkı fazla olanlar (maxAtk düşürüldü) hakkı bırakır — sadece kovalayanlar
    if (avail < 0) {
      const ch = E.filter(e => e.token && e.st === 'chase').sort((a, b) => Math.hypot(b.x - this.mx, b.y - this.my) - Math.hypot(a.x - this.mx, a.y - this.my));
      for (const e of ch) { if (avail >= 0) break; e.token = false; avail++; }
    }
    for (const e of E) {
      if (!e.token && e.st === 'chase') e.st = 'slot';
      if (!e.token && e.st === 'slot' && e.slot < 0) {   // en yakın boş slot (açıya göre)
        const ea = Math.atan2(e.y - this.my, (e.x - this.mx));
        let best = -1, bd = 9;
        for (let k = 0; k < E.length; k++) {
          if (this.slotOwner[k] >= 0) continue;
          const sa = -Math.PI / 2 + Math.PI / E.length + (k / E.length) * Math.PI * 2;
          let d = Math.abs(((sa - ea + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
          d = Math.PI - d; if (d < bd) { bd = d; best = k; }
        }
        if (best >= 0) { e.slot = best; this.slotOwner[best] = e.i; }
      }
    }
  }

  // ---------------- güncelleme ----------------
  update(dt) {
    const T = this.time;
    this.parts.update(dt);
    if (this.st === 'play') this._play(dt, T);
    else if (this.st === 'dead') this._dead(dt, T);
    else this._won(dt, T);
    this._hud();
  }

  _play(dt, T) {
    const ax = this.input.axis.x, ay = this.input.axis.y;
    this.t += dt;
    const sec = Math.ceil(SURVIVE - this.t);
    if (sec < this.lastSec && sec <= 3 && sec >= 1) this.audio.play('tick');
    this.lastSec = Math.min(this.lastSec, sec);
    if (this.invuln > 0) this.invuln -= dt;
    // --- Mobu ---
    const vx = ax * MOBU_SPD + this.kx, vy = ay * MOBU_SPD * 0.85 + this.ky;
    this.mx += vx * dt; this.my += vy * dt;
    const kd = Math.exp(-9 * dt); this.kx *= kd; this.ky *= kd;
    this._clampM();
    this.speed = Math.hypot(ax, ay);
    if (Math.abs(ax) > 0.15) this.mdir = Math.sign(ax);
    if (this.speed > 0.1) this.phase += this.speed * MOBU_SPD * dt * 0.05;
    // --- düşmanlar ---
    this._assignTokens();
    let fear = 0;
    for (const e of this.en) this._enemy(e, dt, T);
    for (const e of this.en) if (e.st === 'prep' && Math.hypot(e.x - this.mx, e.y - this.my) < 220) fear = 1;
    this.fear = fear;
    this._separate();
    // --- hedefler ---
    if (this.hp <= 0) {
      this.st = 'dead'; this.stT = T; this.audio.play('ko'); this.shake(7);
      for (const e of this.en) { e.sx0 = e.x; e.sy0 = e.y; }
      this.parts.stars(this.mx, this.my - 80, this.reduced ? 3 : 7);
    } else if (this.t >= SURVIVE) {
      this.st = 'won'; this.stT = T; this.audio.play('success'); this.flash(0.18);
      if (!this.reduced) this.parts.confetti(this.mx, this.my - 120, 50);
      for (const e of this.en) { e.st = 'idle'; e.token = false; }
    }
  }
  _clampM() {
    const A = this._arena();
    this.mx = clamp(this.mx, A.x0 + 24, A.x1 - 24);
    this.my = clamp(this.my, A.y0 + 44, A.y1 - 6);
  }

  _enemy(e, dt, T) {
    const dx = this.mx - e.x, dy = this.my - e.y, d = Math.hypot(dx, dy) || 1;
    if (Math.abs(dx) > 8) e.dir = Math.sign(dx);
    e.t += dt; e.lift = 0; e.ox = 0; e.oy = 0;
    const go = (tx, ty, stop, spd = EN_SPD) => {
      const ddx = tx - e.x, ddy = ty - e.y, dd = Math.hypot(ddx, ddy);
      if (dd > stop) { const s = Math.min(spd, (dd - stop) * 8 + 10); e.x += ddx / dd * s * dt; e.y += ddy / dd * s * dt; return false; }
      return true;
    };
    switch (e.st) {
      case 'chase': {
        const near = go(this.mx, this.my, 62);
        e.walkT = (e.walkT || 0) + dt * 9;
        if (e.token && d < ATK_RANGE && this.st === 'play') {
          e.st = 'prep'; e.t = 0; e.walkT = 0; this.audio.play('warn');
        }
        void near; break;
      }
      case 'slot': {
        const p = e.slot >= 0 ? this._slotPos(e.slot) : { x: e.x, y: e.y };
        const arrived = go(p.x, p.y, 4);
        e.walkT = (e.walkT || 0) + dt * (arrived ? 12 : 9);
        if (arrived) e.lift = Math.abs(Math.sin(T * 7 + e.i * 1.7)) * 5;
        break;
      }
      case 'prep': {
        e.ax = dx / d; e.ay = dy / d;                         // hedefi son ana kadar izle
        const k = eOut(lin(e.t, 0, PREP));
        e.ox = -e.ax * RECOIL * k; e.oy = -e.ay * RECOIL * k;
        if (e.t >= PREP) { e.st = 'lunge'; e.t = 0; e.hitDone = false; e.px = e.x; e.py = e.y; }
        break;
      }
      case 'lunge': {
        e.x += e.ax * LUNGE_SPD * dt; e.y += e.ay * LUNGE_SPD * dt;
        this._clamp(e);
        if (!e.hitDone && Math.hypot(this.mx - e.x, this.my - e.y) < HIT_R && this.invuln <= 0) { e.hitDone = true; this._hit(e); }
        if (e.t >= LUNGE) { e.st = 'rest'; e.t = 0; e.token = false; }
        break;
      }
      case 'rest':
        if (e.t >= REST) { e.t = 0; e.st = this.s.queue ? 'slot' : 'chase'; if (!this.s.queue) e.token = true; }
        break;
    }
    this._clamp(e);
  }

  _hit(e) {
    this.hp--; this.hits++; this.invuln = INVULN; this.hitT = this.time;
    this.kx = e.ax * 330; this.ky = e.ay * 330;
    this.audio.play('hit'); this.shake(5);
    this.parts.sparks(this.mx, this.my - 60, this.reduced ? 3 : 8, LAV);
  }

  _separate() {
    const E = this.en;
    for (let a = 0; a < E.length; a++) for (let b = a + 1; b < E.length; b++) {
      const p = E[a], q = E[b];
      if (p.st === 'lunge' || q.st === 'lunge') continue;
      const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy);
      if (d < SEP && d > 0.01) { const push = (SEP - d) / 2 * 0.5; p.x -= dx / d * push; p.y -= dy / d * push; q.x += dx / d * push; q.y += dy / d * push; }
    }
    // Mobu'nun üstüne binme (saldırı dışında)
    for (const e of E) if (e.st !== 'lunge') {
      const dx = e.x - this.mx, dy = e.y - this.my, d = Math.hypot(dx, dy);
      if (d < 46 && d > 0.01) { e.x = this.mx + dx / d * 46; e.y = this.my + dy / d * 46; }
      this._clamp(e);
    }
  }

  _dead(dt, T) {
    const u = T - this.stT;
    for (const e of this.en) {
      const s0 = e.i * 0.035, k = clamp((u - s0) / 0.32);
      const tx = this.mx + ((e.i % 3) - 1) * 14, ty = this.my - Math.floor(e.i / 3) * 4;
      e.x = lerp(e.sx0, tx, eOut(k)); e.y = lerp(e.sy0, ty, eOut(k));
      e.lift = Math.sin(k * Math.PI) * 70 + (k >= 1 ? 8 + e.i * 4 : 0);
      e.st = 'idle';
    }
    if (u > 1.0) this.reset();
  }
  _won(dt, T) {
    for (const e of this.en) { e.lift = 0; if (e.st === 'idle' && (e.slot >= 0)) { /* yerinde kal */ } }
    if (this.invuln > 0) this.invuln -= dt;
    this.kx *= Math.exp(-9 * dt); this.ky *= Math.exp(-9 * dt);
    if (T - this.stT > 1.0 && !this.completed) this.complete({ text: this.cfg.lesson });
  }

  _hud() {
    if (!this.tech) { this.hud(null); return; }
    const total = this.en.length;
    const holders = this.en.filter(e => e.token && (e.st === 'chase' || e.st === 'prep' || e.st === 'lunge')).length;
    this.hud({
      left: [`Saldırı hakkı: ${holders}/${total}`, `Bekleyen: ${total - holders}`],
      right: [`Alınan vuruş: ${this.hits}`, `Geçen: ${this.t.toFixed(1)} s`],
    });
  }

  // ---------------- çizim ----------------
  render(g) {
    const W = this.view.w, H = this.view.h, T = this.time, A = this._arena();
    setBoil(T);
    g.fillStyle = '#0a0810'; g.fillRect(0, 0, W, H);
    // arena zemini
    g.save();
    g.beginPath(); g.roundRect(A.x0, A.y0, A.x1 - A.x0, A.y1 - A.y0, 22); g.clip();
    const gr = g.createLinearGradient(0, A.y0, 0, A.y1); gr.addColorStop(0, '#1a1228'); gr.addColorStop(1, '#130d1e');
    g.fillStyle = gr; g.fillRect(A.x0, A.y0, A.x1 - A.x0, A.y1 - A.y0);
    g.strokeStyle = 'rgba(182,124,255,.07)'; g.lineWidth = 1; g.beginPath();
    for (let x = A.x0 + 40 - (A.x0 % 40); x < A.x1; x += 40) { g.moveTo(x, A.y0); g.lineTo(x, A.y1); }
    for (let y = A.y0; y < A.y1; y += 40) { g.moveTo(A.x0, y); g.lineTo(A.x1, y); }
    g.stroke();
    const v = g.createRadialGradient(A.cx, A.cy, 120, A.cx, A.cy, Math.max(A.x1 - A.x0, A.y1 - A.y0) * 0.7);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(60,20,120,.4)'); g.fillStyle = v; g.fillRect(A.x0, A.y0, A.x1 - A.x0, A.y1 - A.y0);
    g.restore();
    g.strokeStyle = 'rgba(182,124,255,.75)'; g.lineWidth = 2.5; g.beginPath(); g.roundRect(A.x0, A.y0, A.x1 - A.x0, A.y1 - A.y0, 22); g.stroke();

    if (this.tech) this._techGround(g, T);

    // karakterler: y'ye göre sıralı
    const items = this.en.map(e => ({ y: e.y, f: () => this._drawEnemy(g, e, T) }));
    items.push({ y: this.my, f: () => this._drawMobu(g, T) });
    items.sort((a, b) => a.y - b.y);
    for (const it of items) it.f();
    this.parts.draw(g);
    if (this.tech) this._techAir(g, T);

    this._ui(g, W, A);
  }

  _drawEnemy(g, e, T) {
    const x = e.x + e.ox, y = e.y + e.oy;
    // gölge
    g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(x, y + 2, 34 - e.lift * 0.15, 11, 0, 0, 7); g.fill();
    let face = 'angry', sx = 1, sy = 1, rot = 0;
    if (e.st === 'prep') { face = 'alert'; const k = eBack(clamp(e.t / PREP)); sy = lerp(1, 0.9, k); sx = lerp(1, 1.08, k); }
    else if (e.st === 'lunge') { face = 'furious'; sx = 1.18; sy = 0.88; }
    else if (e.st === 'rest') face = e.t < 0.45 ? 'dizzy' : 'angry';
    else if (e.st === 'idle') face = this.st === 'won' ? 'confused' : 'dizzy';
    if (this.st === 'dead') face = 'happy';
    const moving = e.st === 'chase' || (e.st === 'slot' && e.lift === 0);
    const foot = moving ? Math.max(0, Math.sin(e.walkT || 0)) * 8 : 0;
    if (e.st === 'chase' || e.st === 'slot') rot = Math.sin((e.walkT || 0) * 0.5) * 0.04;
    enemy(g, { x, y, s: ES, flip: e.dir, face, sx, sy, rot, lift: e.lift, foot, lookX: e.dir }, e.i);
  }

  _drawMobu(g, T) {
    const m = mk(T, this.mx, this.my, MS);
    const u = T - this.stT;
    if (this.st === 'dead') {
      pancake(m, eOut(lin(u, 0.3, 0.45))); m.face = 'x';
      drawMobu(g, m);
      const a = u * 8;
      for (let i = 0; i < 3; i++) { const aa = a + i * Math.PI * 2 / 3; starPoly(g, this.mx + Math.cos(aa) * 44, this.my - 62 + Math.sin(aa) * 10, 8, '#FFD23F', aa, true); }
      return;
    }
    if (this.st === 'won') {
      m.face = 'proud'; m.armL = ARM_HIP; m.armR = ARM_HIP;
      const k = eBack(clamp(u / 0.3)); m.sy *= lerp(0.85, 1, k); m.sx *= lerp(1.1, 1, k);
    } else {
      const hurt = this.time - this.hitT < 0.5;
      if (hurt) { m.face = 'O'; m.armL = m.armR = lerpArm(ARM_DEF, ARM_SCARED, 0.6); m.sx *= 1.12; m.sy *= 0.9; }
      else if (this.fear) { m.face = 'scared'; m.armL = m.armR = ARM_SCARED; if (this.speed > 0.1) walk(m, this.phase, this.mdir, 1, clamp(this.speed, 0.3, 1.1)); m.armL = m.armR = ARM_SCARED; }
      else if (this.speed > 0.1) { m.face = 'calm'; walk(m, this.phase, this.mdir, 1, clamp(this.speed, 0.3, 1.1)); m.face = 'calm'; }
      else m.face = 'happy';
      m.look = this.mdir * 0.4;
    }
    g.save();
    if (this.st === 'play' && this.invuln > 0 && !this.reduced && Math.floor(this.invuln * 20) % 2 === 0) g.globalAlpha = 0.55;
    drawMobu(g, m);
    g.restore();
  }

  // ---- teknik görünüm ----
  _techGround(g, T) {
    g.save();
    if (this.s.queue) {
      g.setLineDash([3, 7]); g.strokeStyle = 'rgba(182,124,255,.55)'; g.lineWidth = 2;
      g.beginPath(); g.ellipse(this.mx, this.my, RING_R, RING_R * 0.85, 0, 0, 7); g.stroke(); g.setLineDash([]);
      for (let k = 0; k < this.en.length; k++) {
        const p = this._slotPos(k);
        g.fillStyle = this.slotOwner[k] >= 0 ? 'rgba(233,221,255,.9)' : 'rgba(182,124,255,.5)';
        g.beginPath(); g.arc(p.x, p.y, 4.5, 0, 7); g.fill();
      }
      g.strokeStyle = 'rgba(233,221,255,.35)'; g.lineWidth = 1.3;
      for (const e of this.en) if (e.slot >= 0 && e.st === 'slot') {
        const p = this._slotPos(e.slot); g.beginPath(); g.moveTo(e.x, e.y); g.lineTo(p.x, p.y); g.stroke();
      }
    }
    // saldırı menzili
    g.setLineDash([4, 5]); g.strokeStyle = 'rgba(255,90,100,.4)'; g.lineWidth = 1.4;
    for (const e of this.en) if (e.token && (e.st === 'chase' || e.st === 'prep')) { g.beginPath(); g.arc(e.x, e.y, ATK_RANGE, 0, 7); g.stroke(); }
    g.setLineDash([]); g.restore();
  }
  _techAir(g, T) {
    if (!this.s.queue) return;
    for (const e of this.en) if (e.token && (e.st === 'chase' || e.st === 'prep' || e.st === 'lunge')) {
      g.save(); g.translate(e.x + e.ox, e.y + e.oy); g.scale(0.8, 0.8); marker(g, 0, 0, T + e.i, 1); g.restore();
    }
  }

  // ---- ekran arayüzü ----
  _ui(g, W, A) {
    hearts(g, A.x0 + 2, 11, this.hp, HEARTS, 22);
    const left = Math.max(0, SURVIVE - this.t), sec = this.st === 'won' ? 0 : Math.ceil(left);
    const warn = left <= 3 && this.st === 'play';
    const bx = A.x0 + 2 + HEARTS * 28 + 10, bw = A.x1 - bx - 56;
    bar(g, bx, 18, bw, 8, this.st === 'won' ? 1 : this.t / SURVIVE, warn ? RED : PURPLE);
    txt(g, `${sec} sn`, A.x1 - 2, 22, 18, warn ? RED : LAV, 'right', 900, true);
    if (this.st === 'won') pill(g, `Alınan vuruş: ${this.hits}`, A.cx, A.y0 + 22, PURPLE, 15);
  }
}
