// zaman.js — #08 "Oyunlarda zamanı nasıl yavaşlatıyorlar?"
// Çekirdek fikir: iki ayrı zaman ölçeği. Dünya (mermiler/atıcılar) worldScale ile, Mobu playerScale ile,
// arayüz ve süre sayaçları ise HER ZAMAN gerçek dt ile ilerler.
import { Experiment } from '../core/experiment.js';
import { clamp, lin, lerp, eOut, eBack, rng, moveToward } from '../core/math.js';
import { INK, PURPLE, GLOW, LAV, RED, GOLD, setBoil, poly } from '../core/ink.js';
import { mk, walk, pancake, landSq, drawMobu, ARM_HIP, ARM_DEF, ARM_SCARED, lerpArm } from '../core/mobu.js';
import { Particles, glowAt, starPoly } from '../core/fx.js';
import { txt, pill, bar, hearts } from '../core/ui.js';

const S = 0.3;                         // Mobu ölçeği (~140 px)
const SPEED = 200;                     // Mobu hızı (px/sn, normal zaman)
const GATE = 170;                      // bu çizginin üstüne ayak basınca bitti
const LANES = [230, 334, 438];         // atıcı sıraları (eşit aralık)
const BR = 8;                          // mermi yarıçapı
const FADE = 0.15;                     // zaman ölçeği geçiş süresi (gerçek sn)
const KNOCK = 0.25;                    // geri itilme süresi
const INV = 0.7;                       // vurulduktan sonra dokunulmazlık (gerçek sn)
const TOWER_Y = 84;

export default class Zaman extends Experiment {
  static id = 'zaman';
  static kind = '2d';
  static controls = {
    joystick: true, buttons: [{ name: 'slow', label: 'YAVAŞLAT' }], pointer: null,
    hint: '← ↑ → ↓ ya da WASD: yürü · Shift: zamanı yavaşlat',
    hintTouch: 'Joystick: yürü · YAVAŞLAT: zamanı yavaşlat',
  };
  static settings = [
    { key: 'worldScale', label: 'Dünya hızı (yavaşken)', type: 'range', value: 0.25, min: 0.1, max: 1, step: 0.05, unit: '×', group: 'Zaman' },
    { key: 'playerInfluence', label: 'Oyuncu etkilenme', type: 'range', value: 0.3, min: 0, max: 1, step: 0.1, group: 'Zaman' },
    { key: 'mode', label: 'Yavaşlatma', type: 'select', value: 'hold', options: [{ value: 'hold', label: 'Basılı tut' }, { value: 'toggle', label: 'Aç/kapat' }], group: 'Zaman' },
    { key: 'energy', label: 'Enerji', type: 'range', value: 4, min: 1, max: 10, step: 1, unit: 's', group: 'Zaman' },
    { key: 'noSlow', label: 'Yavaşlatmasız dene', type: 'button', group: 'Karşılaştır' },
    { key: 'slow25', label: '0.25× dene', type: 'button', group: 'Karşılaştır' },
  ];

  init() {
    this.parts = new Particles(200);
    this.attempts = 0;
    this.reset();
  }

  reset() {
    this.attempts = 0;
    this._start();
  }

  // bir deneme: tüm durum sıfır (ölünce de bu çağrılır)
  _start() {
    const W = this.view.w, H = this.view.h;
    this.parts.clear();
    this.bullets = []; this.hits = 0; this.shots = 0;
    // atıcılar: solda 3, sağda 3 (eşit aralık, aynalı); seeded zamanlama
    const r = rng(8080 + this.attempts * 31);
    this.shooters = [];
    for (const side of [1, -1]) LANES.forEach((y, i) => {
      const spd = 180 + Math.floor(r() * 5) * 35;                   // 180..320
      const gap = 1.1 + r() * 1.0;
      this.shooters.push({ side, y, spd, gap, next: 0.3 + r() * 1.2, last: 0, fired: -9, seed: this.shooters.length });
    });
    this.tower = { next: 3.2, gap: 3.4, fired: -9 };
    this.x = W / 2; this.y = H - 30; this.dir = 1; this.phase = 0; this.vx = 0; this.vy = 0;
    this.hearts = 3; this.st = 'play'; this.stT = 0; this.invT = 0; this.hitT = -9; this.spawnT = this.time;
    this.kFrom = null; this.maxE = this.s.energy; this.en = this.maxE; this.active = false; this.locked = false;
    this.curW = 1; this.curP = 1; this.tReal = 0; this.tWorld = 0; this.tPlayer = 0;
    this.slowUsed = 0; this.hinted = false;
    this.hud(null);
  }

  onSetting(key) {
    if (key === 'noSlow') { this.setSetting('worldScale', 1); this._restartAll(); this.toast('Yavaşlatma etkisiz: dünya hep aynı hızda', 2200); }
    else if (key === 'slow25') { this.setSetting('worldScale', 0.25); this._restartAll(); this.toast('Dünya 0.25× · Shift ile yavaşlat', 2200); }
    else if (key === 'energy') { this.maxE = this.s.energy; this.en = Math.min(this.en, this.maxE); }
  }
  _restartAll() { this.attempts = 0; this._start(); }

  get fx0() { return (this.view.w - Math.min(this.view.w, 520)) / 2; }
  get fx1() { return this.view.w - this.fx0; }
  get targetWorld() { return this.active ? this.s.worldScale : 1; }
  get targetPlayer() { return lerp(1, this.s.worldScale, this.s.playerInfluence); }

  // ---------------- güncelleme ----------------
  update(dt) {
    const inp = this.input, W = this.view.w, H = this.view.h;
    this.maxE = this.s.energy;
    // --- yavaşlatma girdisi + enerji (gerçek zaman) ---
    if (this.st === 'play' || this.st === 'knock') {
      const was = this.active;
      let want;
      if (this.s.mode === 'toggle') { if (inp.pressed('slow')) this.wantToggle = !this.wantToggle; want = this.wantToggle; }
      else { this.wantToggle = false; want = inp.held('slow'); }
      if (this.locked && this.en > 0.5) this.locked = false;
      this.active = want && this.en > 0 && !this.locked;
      if (this.active) {
        this.en = Math.max(0, this.en - dt); this.slowUsed += dt;
        if (this.en <= 0) { this.locked = true; this.active = false; this.wantToggle = false; this.toast('Enerji bitti', 1000); }
      } else this.en = Math.min(this.maxE, this.en + 2 * dt);
      if (this.active && !was) this.audio.play('slowIn');
      else if (was && !this.active) this.audio.play('slowOut');
    } else { this.active = false; this.wantToggle = false; this.en = Math.min(this.maxE, this.en + 2 * dt); }
    // --- ölçekler hedefe 0.15 sn'de yumuşak geçer ---
    const k = 1 - Math.exp(-dt * 3 / FADE);
    this.curW += (this.targetWorld - this.curW) * k;
    this.curP += (this.targetPlayer - this.curP) * k;
    const dtW = dt * this.curW, dtP = dt * this.curP;
    if (this.st !== 'won') { this.tReal += dt; this.tWorld += dtW; this.tPlayer += dtP; }
    this.parts.update(dtW);
    if (this.invT > 0) this.invT -= dt;

    this._shooters(dtW);
    this._bullets(dtW);
    if (this.st === 'play') this._move(dtP, inp, W, H);
    else if (this.st === 'knock') this._knock(dt);
    else if (this.st === 'ko') {
      if (this.time - this.stT > 1.0) { this.attempts++; this._start(); }
    } else if (this.st === 'won') {
      this.vx = this.vy = 0;
      if (this.time - this.stT > 0.9 && !this.completed) this.complete({ text: this.cfg.lesson });
    }
    this._hud();
  }

  _shooters(dtW) {
    const W = this.view.w;
    for (const s of this.shooters) {
      s.last += dtW;
      s.next -= dtW;
      if (s.next <= 0) {
        s.next += s.gap; s.last = 0; s.fired = this.tWorld; s.int = s.gap;
        this.bullets.push({ x: s.side > 0 ? this.fx0 + 22 : this.fx1 - 22, y: s.y, vx: s.side * s.spd, vy: 0, spd: s.spd });
        this.shots++;
      }
    }
    const t = this.tower;
    t.next -= dtW;
    if (t.next <= 0 && this.st === 'play' && this.y > GATE + 40) {
      t.next += t.gap; t.fired = this.tWorld;
      const cx = W / 2, cy = TOWER_Y + 18, dx = this.x - cx, dy = this.y - 50 - cy, d = Math.hypot(dx, dy) || 1;
      this.bullets.push({ x: cx, y: cy, vx: dx / d * 180, vy: dy / d * 180, spd: 180 });
      this.shots++;
    } else if (t.next <= 0) t.next = 0.3;
  }

  _bullets(dtW) {
    const W = this.view.w, H = this.view.h;
    for (const b of this.bullets) { b.x += b.vx * dtW; b.y += b.vy * dtW; }
    this.bullets = this.bullets.filter(b => b.x > this.fx0 - 30 && b.x < this.fx1 + 30 && b.y > -30 && b.y < H + 30);
    if (this.st !== 'play' || this.invT > 0) return;
    const cs = [[this.x, this.y - 35, 18], [this.x, this.y - 85, 14]];
    for (const b of this.bullets) for (const c of cs) {
      if (Math.hypot(b.x - c[0], b.y - c[1]) < c[2] + BR) { this._hurt(b); return; }
    }
  }

  _hurt(b) {
    this.hits++; this.hearts--; this.hitT = this.time; this.invT = INV + KNOCK;
    this.bullets = this.bullets.filter(q => q !== b);
    this.parts.burst(this.x, this.y - 60, { n: 8, speed: 140, life: 0.5, size: 4, col: LAV });
    this.audio.play('hurt'); this.shake(5);
    if (this.hearts <= 0) {
      this.st = 'ko'; this.stT = this.time; this.vx = this.vy = 0; this.audio.play('ko');
      this.parts.stars(this.x, this.y - 100, 6);
    } else {
      this.st = 'knock'; this.stT = this.time; this.kFrom = { x: this.x, y: this.y };
      if (this.hits === 2 && !this.hinted && this.slowUsed < 0.2) { this.hinted = true; this.toast('Shift: zamanı yavaşlat', 2000); }
    }
  }

  _knock(dt) {
    const W = this.view.w, H = this.view.h, u = clamp((this.time - this.stT) / KNOCK);
    const e = eOut(u), tx = W / 2, ty = H - 30;
    const px = this.x, py = this.y;
    this.x = lerp(this.kFrom.x, tx, e); this.y = lerp(this.kFrom.y, ty, e);
    this.vx = (this.x - px) / dt; this.vy = (this.y - py) / dt;
    if (u >= 1) { this.st = 'play'; this.vx = this.vy = 0; }
  }

  _move(dtP, inp, W, H) {
    const ax = inp.axis.x, ay = inp.axis.y;
    const px = this.x, py = this.y;
    this.x = clamp(this.x + ax * SPEED * dtP, this.fx0 + 30, this.fx1 - 30);
    this.y = clamp(this.y + ay * SPEED * dtP, GATE - 60, H - 14);
    const moved = Math.hypot(this.x - px, this.y - py);
    if (Math.abs(ax) > 0.15) this.dir = Math.sign(ax);
    this.phase += moved * 0.05;
    const dtr = 1 / 120;
    this.vx = (this.x - px) / dtr; this.vy = (this.y - py) / dtr;   // gerçek sn cinsinden etkin hız
    if (moved > 0 && this.frame % 18 === 0) this.parts.dust(this.x, this.y, 1, -this.dir);
    if (this.y <= GATE) {
      this.st = 'won'; this.stT = this.time; this.audio.play('success'); this.flash(0.2);
      this.parts.confetti(this.x, this.y - 80, 50);
    }
  }

  _hud() {
    if (!this.tech) { this.hud(null); return; }
    const f = (v, d = 1) => v.toFixed(d);
    this.hud({
      left: [`Gerçek: ${f(this.tReal)} s · Dünya: ${f(this.tWorld)} s · Oyuncu: ${f(this.tPlayer)} s`,
        `dt dünya ×${f(this.curW, 2)} · oyuncu ×${f(this.curP, 2)}`],
      right: [`Mermi: ${this.bullets.length} · Vuruş: ${this.hits}`],
    });
  }

  // ---------------- çizim ----------------
  render(g) {
    const W = this.view.w, H = this.view.h, T = this.time;
    setBoil(T);
    this._bg(g, W, H, T);
    this._gate(g, W, T);
    if (this.fx0 > 0) { g.fillStyle = "rgba(8,5,14,.72)"; g.fillRect(0, 0, this.fx0, H); g.fillRect(this.fx1, 0, this.fx0, H); }
    for (const s of this.shooters) this._shooter(g, s);
    this._tower(g, W, T);
    this._bulletsDraw(g, T);
    this._mobu(g, T);
    this.parts.draw(g);
    if (this.tech) this._techWorld(g, W);
    this._ui(g, W, H, T);
    this._vignette(g, W, H);
  }

  _bg(g, W, H, T) {
    const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#0d0a14'); gr.addColorStop(0.7, '#150f20'); gr.addColorStop(1, '#0c0914');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    glowAt(g, W / 2, H * 0.62, Math.min(W, 520), '139,61,255', 0.07);
    // başlangıç alanı
    g.save(); g.strokeStyle = 'rgba(182,124,255,.28)'; g.lineWidth = 3; g.setLineDash([10, 8]);
    g.beginPath(); g.roundRect(W / 2 - 60, H - 36, 120, 28, 10); g.stroke(); g.restore();
  }

  _gate(g, W, T) {
    g.fillStyle = '#1a1329'; g.fillRect(0, 0, W, GATE);
    g.fillStyle = '#2b2142'; g.fillRect(0, GATE - 10, W, 10);
    g.fillStyle = 'rgba(182,124,255,.6)'; g.fillRect(0, GATE - 10, W, 2.5);
    // bayrak (sol ve sağda aynalı)
    for (const sd of [-1, 1]) {
      const px = sd < 0 ? this.fx0 + 46 : this.fx1 - 46, top = GATE - 10, wv = Math.sin(T * 4 + sd) * 3;
      g.strokeStyle = INK; g.lineWidth = 8; g.lineCap = 'round'; g.beginPath(); g.moveTo(px, top); g.lineTo(px, top - 62); g.stroke();
      g.strokeStyle = '#b9b2c9'; g.lineWidth = 3.5; g.beginPath(); g.moveTo(px, top); g.lineTo(px, top - 62); g.stroke();
      const d = sd < 0 ? 1 : -1;
      g.beginPath(); g.moveTo(px, top - 62); g.quadraticCurveTo(px + d * 14, top - 62 + wv, px + d * 30, top - 52 + wv);
      g.quadraticCurveTo(px + d * 14, top - 40 + wv, px, top - 38); g.closePath();
      g.lineJoin = 'round'; g.strokeStyle = INK; g.lineWidth = 5; g.stroke(); g.fillStyle = PURPLE; g.fill();
    }
  }

  _shooter(g, s) {
    const x = s.side > 0 ? this.fx0 : this.fx1, y = s.y, d = s.side;
    const charge = 1 - clamp(s.next / s.gap);                  // 0..1
    const glow = lin(charge, 0.75, 1);
    g.save();
    g.fillStyle = '#2b2142'; g.strokeStyle = INK; g.lineWidth = 3.5; g.lineJoin = 'round';
    g.beginPath(); g.roundRect(x - (d > 0 ? 10 : 22), y - 18, 32, 36, 6); g.fill(); g.stroke();
    g.fillStyle = '#3d3556'; g.beginPath(); g.roundRect(x + d * 14 - (d > 0 ? 0 : 12), y - 7, 12, 14, 3); g.fill(); g.stroke();
    if (glow > 0) glowAt(g, x + d * 26, y, 22, '182,124,255', 0.6 * glow);
    g.fillStyle = glow > 0 ? LAV : '#6b5f86'; g.beginPath(); g.arc(x + d * 8, y, 4, 0, 7); g.fill();
    g.restore();
  }

  _tower(g, W, T) {
    const x = W / 2, y = TOWER_Y, glow = lin(1 - clamp(this.tower.next / this.tower.gap), 0.8, 1);
    g.save(); g.fillStyle = '#2b2142'; g.strokeStyle = INK; g.lineWidth = 3.5; g.lineJoin = 'round';
    g.beginPath(); g.roundRect(x - 20, y - 14, 40, 30, 7); g.fill(); g.stroke();
    g.fillStyle = '#3d3556'; g.beginPath(); g.arc(x, y + 20, 11, 0, 7); g.fill(); g.stroke();
    if (glow > 0) glowAt(g, x, y + 20, 26, '182,124,255', 0.6 * glow);
    g.fillStyle = glow > 0 ? LAV : '#6b5f86'; g.beginPath(); g.arc(x, y + 20, 4, 0, 7); g.fill();
    g.restore();
  }

  _bulletsDraw(g, T) {
    const slowK = this.reduced ? 1 + (1 / Math.max(this.curW, 0.1) - 1) * 0.12 : 1 + (1 / Math.max(this.curW, 0.1) - 1) * 0.35;
    for (const b of this.bullets) {
      const v = Math.hypot(b.vx, b.vy) || 1, ux = b.vx / v, uy = b.vy / v;
      const L = (10 + b.spd * 0.07) * slowK, tx = b.x - ux * L, ty = b.y - uy * L;
      const gr = g.createLinearGradient(b.x, b.y, tx, ty); gr.addColorStop(0, 'rgba(160,140,200,.55)'); gr.addColorStop(1, 'rgba(160,140,200,0)');
      g.strokeStyle = gr; g.lineWidth = BR * 1.7; g.lineCap = 'round'; g.beginPath(); g.moveTo(b.x, b.y); g.lineTo(tx, ty); g.stroke();
      g.fillStyle = '#7d6f99'; g.beginPath(); g.arc(b.x, b.y, BR, 0, 7); g.fill();
      g.strokeStyle = INK; g.lineWidth = 2.5; g.stroke();
      g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.arc(b.x - 2.5, b.y - 2.5, 2.2, 0, 7); g.fill();
    }
  }

  _mobu(g, T) {
    const m = mk(T, this.x, this.y, S);
    const slowing = this.curW < 0.97;
    if (this.st === 'ko') {
      const k = eOut(lin(T - this.stT, 0, 0.14)); pancake(m, k); m.face = 'x'; drawMobu(g, m);
      const a = (T - this.stT) * 7;
      for (let i = 0; i < 3; i++) { const aa = a + i * Math.PI * 2 / 3; starPoly(g, this.x + Math.cos(aa) * 34, this.y - 58 + Math.sin(aa) * 8, 8, '#FFD23F', aa, true); }
      return;
    }
    if (this.st === 'won') { m.face = 'proud'; m.armL = m.armR = ARM_HIP; landSq(m, T, this.stT, 0.6, 0.3); }
    else if (this.st === 'knock') {
      m.face = 'O'; m.armL = m.armR = lerpArm(ARM_DEF, ARM_SCARED, 0.8); m.rot = -0.12 * this.dir; m.legL = [-8, -20]; m.legR = [8, -22];
    } else {
      const moving = Math.hypot(this.vx, this.vy) > 20;
      if (moving) walk(m, this.phase, this.dir, 1, clamp(Math.hypot(this.vx, this.vy) / SPEED, 0.3, 1.1));
      m.face = slowing && this.active ? 'sus' : (this.time - this.hitT < 0.9 ? 'O' : 'calm');
      if (slowing && this.active) m.armL = m.armR = lerpArm(ARM_DEF, ARM_HIP, 0.5);
      const sp = T - this.spawnT; if (sp < 0.3) { const k = eBack(clamp(sp / 0.3)); m.sx *= lerp(0.6, 1, k); m.sy *= lerp(0.6, 1, k); }
    }
    // vurulduktan sonra yanıp sönme (azaltılmışta sabit solukluk)
    if (this.invT > 0 && this.st !== 'knock') {
      const bl = this.reduced ? 0.7 : (Math.floor(T * 14) % 2 ? 0.45 : 1);
      g.save(); g.globalAlpha = bl; drawMobu(g, m); g.restore();
    } else drawMobu(g, m);
  }

  _techWorld(g, W) {
    g.save();
    // mermi hız okları (uzunluk = etkin hız × 0.3 sn) ve vuruş dairesi
    for (const b of this.bullets) {
      const vx = b.vx * this.curW * 0.3, vy = b.vy * this.curW * 0.3, l = Math.hypot(vx, vy);
      g.strokeStyle = 'rgba(233,221,255,.9)'; g.lineWidth = 2; g.beginPath(); g.moveTo(b.x, b.y); g.lineTo(b.x + vx, b.y + vy); g.stroke();
      if (l > 5) { const a = Math.atan2(vy, vx), ex = b.x + vx, ey = b.y + vy; g.beginPath(); g.moveTo(ex, ey); g.lineTo(ex - Math.cos(a - 0.5) * 7, ey - Math.sin(a - 0.5) * 7); g.moveTo(ex, ey); g.lineTo(ex - Math.cos(a + 0.5) * 7, ey - Math.sin(a + 0.5) * 7); g.stroke(); }
      g.strokeStyle = 'rgba(255,90,110,.8)'; g.lineWidth = 1.2; g.beginPath(); g.arc(b.x, b.y, BR, 0, 7); g.stroke();
    }
    // atıcılarda sonraki atışa kalan süre yayı
    const arc = (x, y, s) => {
      const k = clamp(s.next / s.gap);
      g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 3; g.beginPath(); g.arc(x, y, 14, 0, 7); g.stroke();
      g.strokeStyle = LAV; g.beginPath(); g.arc(x, y, 14, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2); g.stroke();
      txt(g, Math.max(0, s.next).toFixed(1), x, y + 27, 10, LAV, 'center', 700, true);
    };
    for (const s of this.shooters) arc(s.side > 0 ? this.fx0 + 44 : this.fx1 - 44, s.y, s);
    arc(W / 2, TOWER_Y + 52, { next: this.tower.next, gap: this.tower.gap });
    // Mobu hitbox daireleri + hız vektörü
    g.strokeStyle = 'rgba(182,124,255,.95)'; g.lineWidth = 1.6;
    g.beginPath(); g.arc(this.x, this.y - 35, 18, 0, 7); g.stroke(); g.beginPath(); g.arc(this.x, this.y - 85, 14, 0, 7); g.stroke();
    const mx = this.vx * 0.3, my = this.vy * 0.3;   // etkin hız × 0.3 sn
    if (Math.hypot(mx, my) > 2) { g.strokeStyle = GOLD; g.lineWidth = 2.5; g.beginPath(); g.moveTo(this.x, this.y - 60); g.lineTo(this.x + mx, this.y - 60 + my); g.stroke(); }
    g.restore();
  }

  _ui(g, W, H, T) {
    // arayüz gerçek zamanla çalışır: kalpler, enerji çubuğu, süre
    hearts(g, this.fx0 + 10, 10, this.hearts, 3, 20);
    const bx = this.fx0 + 100, bw = Math.max(80, this.fx1 - this.fx0 - 100 - 86);
    const k = this.en / this.maxE;
    bar(g, bx, 15, bw, 11, k, this.locked || k < 0.2 ? RED : (this.active ? LAV : PURPLE));
    txt(g, `${this.en.toFixed(1)} s`, bx + bw / 2, 21, 10, '#fff', 'center', 900, true);
    txt(g, `${this.tReal.toFixed(1)} s`, this.fx1 - 10, 21, 14, '#fff', 'right', 900, true);
    if (this.active && this.curW < 0.97) pill(g, `YAVAŞ ×${this.s.worldScale.toFixed(2)}`, W / 2, 46, PURPLE, 11);
  }

  _vignette(g, W, H) {
    const a = clamp((1 - this.curW) / 0.9) * (this.reduced ? 0.45 : 1);
    const v = g.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, Math.max(W, H) * 0.7);
    v.addColorStop(0, `rgba(30,0,70,${0.28 * a})`); v.addColorStop(1, `rgba(60,20,120,${0.38 + 0.3 * a})`);
    g.fillStyle = v; g.fillRect(0, 0, W, H);
  }
}
