// iframes.js — #10 "Oyunlarda vurulunca neden ölümsüz oluyorsun?"
// Üç AYRI kavram, üç ayrı kod yolu: _damage (hasar), _knock (geri savrulma), invuln (dokunulmazlık).
import { Experiment } from '../core/experiment.js';
import { clamp, lin, lerp, eOut, eBack, moveToward } from '../core/math.js';
import { INK, PURPLE, GLOW, LAV, RED, setBoil, poly, inkLine, HATCH_L } from '../core/ink.js';
import { mk, walk, landSq, pancake, drawMobu, ARM_UPS, ARM_HIP, ARM_DEF, ARM_SCARED, lerpArm } from '../core/mobu.js';
import { Particles, glowAt, starPoly } from '../core/fx.js';
import { txt, hearts } from '../core/ui.js';

const S = 0.3, HALF = 28, BH = 120;
const RUN = 240, ACC = 1800, DEC = 2600, AIR_ACC = 1200, GRAV = 1500, JV = -540;
const FLOOR = 500, CEIL = 64, MAXHP = 5, TICK = 0.1, KB_VX = 320, KB_VY = -300;
const SPIKE_X = [560, 1920], SAW_X = [900, 2260], BLADE_X = [1240, 2600];
const CHECK_X = [1580, 2940], GOAL_X = 3300, X_MIN = 40, X_MAX = 3440;
const SPIKE_CYC = 2.4, SAW_CYC = 2.6, BLADE_CYC = 2.2, BLADE_L = 380, BLADE_AMP = 0.65;

export default class IFrames extends Experiment {
  static id = 'iframes';
  static kind = '2d';
  static controls = {
    joystick: 'horizontal', buttons: [{ name: 'jump', label: 'ZIPLA' }], pointer: null,
    hint: '← → ya da A D: yürü · Boşluk: zıpla',
    hintTouch: 'Joystick: yürü · ZIPLA: zıpla',
  };
  static settings = [
    { key: 'iframes', label: 'Dokunulmazlık (i-frames)', type: 'toggle', value: true, group: 'Dokunulmazlık' },
    { key: 'iframesMs', label: 'Süre', type: 'range', value: 1000, min: 200, max: 2000, step: 100, unit: 'ms', group: 'Dokunulmazlık' },
    { key: 'knockback', label: 'Geri savrulma', type: 'toggle', value: true, group: 'Geri savrulma' },
    { key: 'damage', label: 'Temas başı hasar', type: 'range', value: 1, min: 1, max: 3, step: 1, group: 'Hasar' },
    { key: 'tryOff', label: 'Dokunulmazlıksız dene', type: 'button', group: 'Karşılaştır' },
    { key: 'tryOn', label: 'Dokunulmazlıklı dene', type: 'button', group: 'Karşılaştır' },
  ];

  init() {
    this.parts = new Particles(260);
    this.fl = [];            // yükselen yazılar
    this.rings = [];         // kalkan halkaları
    this.reset();
  }

  reset() {
    this.parts.clear(); this.fl.length = 0; this.rings.length = 0;
    this.spawn = { x: 120 };
    this.checks = CHECK_X.map(x => ({ x, on: false, t0: -9 }));
    this.x = this.spawn.x; this.y = FLOOR; this.vx = 0; this.vy = 0; this.dir = 1; this.grounded = true;
    this.hp = MAXHP; this.lastHp = MAXHP; this.invuln = 0; this.invTotal = 1; this.stun = 0;
    this.contactT = TICK; this.prevIds = new Set(); this.inContact = false; this.overlaps = [];
    this.contacts = 0; this.dmgTotal = 0; this.protectedN = 0; this.deaths = 0;
    this.hurtT = -9; this.hurtDir = 1; this.protT = -9; this.landT = -9; this.phase = 0; this.glintT = -9;
    this.hbreak = []; this.sim = 0; this.st = 'play'; this.stT = 0; this.spawnT = -9;
    this.camera.x = this.x; this.camera.y = 300; this.camera.z = 1;
    this.hud(null);
  }

  onSetting(key) {
    if (key === 'tryOff') { this.setSetting('iframes', false); this.reset(); this.toast('Dokunulmazlık kapalı: tehlikenin içinde kalma', 2200); }
    else if (key === 'tryOn') { this.setSetting('iframes', true); this.reset(); this.toast('Dokunulmazlık açık', 1600); }
    else if (key === 'iframes' && !this.s.iframes) this.invuln = 0;
  }

  // ---------------- tehlikeler (tek kaynak: hem fizik hem çizim) ----------------
  _hazards() {
    const t = this.sim, out = [];
    for (const x of SPIKE_X) {
      const k = this._spikeK(t);
      out.push({ id: 'sp' + x, kind: 'spike', cx: x, k, on: k > 0.4, shapes: [{ r: [x - 75, FLOOR - 36, x + 75, FLOOR] }] });
    }
    for (const x of SAW_X) {
      const cy = 272 + 190 * (0.5 + 0.5 * Math.sin(Math.PI * 2 * t / SAW_CYC));
      out.push({ id: 'sw' + x, kind: 'saw', cx: x, cy, on: true, shapes: [{ c: [x, cy, 32] }] });
    }
    for (const x of BLADE_X) {
      const th = BLADE_AMP * Math.sin(Math.PI * 2 * t / BLADE_CYC), sx = Math.sin(th), cs = Math.cos(th);
      const hx = x + BLADE_L * sx, hy = CEIL + 6 + BLADE_L * cs;
      out.push({ id: 'bl' + x, kind: 'blade', cx: hx, px: x, th, hx, hy, on: true,
        shapes: [{ c: [hx, hy, 30] }, { c: [x + BLADE_L * 0.8 * sx, CEIL + 6 + BLADE_L * 0.8 * cs, 11] }, { c: [x + BLADE_L * 0.62 * sx, CEIL + 6 + BLADE_L * 0.62 * cs, 11] }] });
    }
    return out;
  }
  _spikeK(t) {                        // 0 = inik, 1 = tam çıkık
    const p = t % SPIKE_CYC;
    if (p < 1.2) return 0;
    if (p < 1.35) return (p - 1.2) / 0.15;
    if (p < 2.15) return 1;
    if (p < 2.3) return 1 - (p - 2.15) / 0.15;
    return 0;
  }
  _shapeHit(s, bx0, by0, bx1, by1) {
    if (s.r) return s.r[0] < bx1 && s.r[2] > bx0 && s.r[1] < by1 && s.r[3] > by0;
    const [cx, cy, r] = s.c, nx = clamp(cx, bx0, bx1), ny = clamp(cy, by0, by1);
    return (cx - nx) ** 2 + (cy - ny) ** 2 < r * r;
  }

  // ---------------- güncelleme ----------------
  update(dt) {
    const T = this.time;
    this.parts.update(dt);
    this.fl = this.fl.filter(f => T - f.t0 < 1.0); this.rings = this.rings.filter(r => T - r.t0 < 0.5);
    this.hbreak = this.hbreak.filter(h => T - h.t0 < 0.7);
    this.sim += dt;
    if (this.st === 'dead') this._dead(T);
    else if (this.st === 'won') this._won(dt, T);
    else { this._move(dt, T); this._contact(dt, T); }
    this._camera(dt);
    if (this.tech) {
      const right = [`Dokunulmazlık: ${this.invuln.toFixed(2)} s`, `Geri savrulma: ${this.s.knockback ? 'açık' : 'kapalı'}`];
      if (!this.s.iframes) right.push(`Hasar tiki: ${Math.round(TICK * 1000)} ms`);
      this.hud({ left: [`Temas: ${this.contacts} · Hasar: ${this.dmgTotal}`, `Korunan temas: ${this.protectedN}`], right });
    } else this.hud(null);
  }

  _move(dt, T) {
    const inp = this.input, ax = this.stun > 0 ? 0 : inp.axis.x;
    if (this.stun > 0) this.stun -= dt;
    if (Math.abs(ax) > 0.15) this.dir = Math.sign(ax);
    const tvx = Math.abs(ax) > 0.15 ? ax * RUN : 0;
    if (this.stun > 0) this.vx = moveToward(this.vx, 0, 500 * dt);
    else this.vx = moveToward(this.vx, tvx, (this.grounded ? (tvx ? ACC : DEC) : AIR_ACC) * dt);
    this.x = clamp(this.x + this.vx * dt, X_MIN, X_MAX);
    if (inp.pressed('jump') && this.grounded) { this.vy = JV; this.grounded = false; this.audio.play('jump'); this.parts.dust(this.x, this.y, 4); }
    this.vy = Math.min(this.vy + GRAV * dt, 1100);
    this.y += this.vy * dt;
    if (this.y >= FLOOR) {
      const imp = this.vy; this.y = FLOOR; this.vy = 0;
      if (!this.grounded) { this.landT = T; if (imp > 250) { this.audio.play('land'); this.parts.dust(this.x, this.y, 5); } }
      this.grounded = true;
    } else this.grounded = false;
    if (this.grounded && Math.abs(this.vx) > 20) this.phase += Math.abs(this.vx) * dt * 0.05;
    if (this.grounded && Math.abs(this.vx) > 120 && this.frame % 14 === 0) this.parts.dust(this.x - this.dir * 14, this.y, 1, -this.dir);
    // kontrol noktaları
    for (const c of this.checks) if (!c.on && this.x >= c.x) {
      c.on = true; c.t0 = T; this.spawn = { x: c.x }; this.audio.play('pop'); this.parts.sparks(c.x, FLOOR - 70, 8, GLOW); this.toast('Kontrol noktası', 1100);
    }
    if (this.x >= GOAL_X - 10) {
      this.st = 'won'; this.stT = T; this.audio.play('success'); this.flash(0.2); this.parts.confetti(GOAL_X, FLOOR - 120, 60);
    }
    // dokunulmazlık sayacı
    if (this.invuln > 0) { this.invuln = Math.max(0, this.invuln - dt); if (this.invuln === 0) this._invEnd(T); }
  }
  _invEnd(T) { this.glintT = T; if (!this.reduced) this.parts.sparks(this.x, this.y - 70, 6, GLOW); }

  // ---- temas tespiti (hasar / koruma kararı burada verilir) ----
  _contact(dt, T) {
    const bx0 = this.x - HALF, bx1 = this.x + HALF, by0 = this.y - BH, by1 = this.y;
    const ov = [];
    for (const h of this._hazards()) if (h.on && h.shapes.some(s => this._shapeHit(s, bx0, by0, bx1, by1))) ov.push(h);
    this.overlaps = ov; this.inContact = ov.length > 0;
    if (!ov.length) { this.contactT = TICK; this.prevIds = new Set(); return; }
    const ids = new Set(ov.map(h => h.id)), fresh = ov.some(h => !this.prevIds.has(h.id));
    this.prevIds = ids;
    if (this.invuln > 0) {                       // dokunulmazlık: hasar YOK, yalnız "korunan temas"
      if (fresh) this._protected(T);
      return;
    }
    this.contactT += dt;                         // hasar tiki: temas sürdükçe her 100 ms'de bir
    if (this.contactT >= TICK) {
      this.contactT = 0;
      let kd = this.dir * -1; const dx = this.x - ov[0].cx; if (Math.abs(dx) > 4) kd = Math.sign(dx);
      this._damage(T, kd);
    }
  }

  // 1) HASAR: yalnızca can düşer
  _damage(T, kd) {
    const d = this.s.damage;
    this.contacts++; this.dmgTotal += d; this.hp = Math.max(0, this.hp - d);
    this.hurtT = T; this.hurtDir = kd; this.audio.play('hurt'); this.shake(4);
    this.fl.push({ x: this.x + (this.fl.length % 2 ? 14 : -14), y: this.y - 150, t0: T, s: '-' + d, col: RED });
    this.parts.sparks(this.x, this.y - 70, 5, RED);
    for (let i = this.hp; i < this.lastHp; i++) this.hbreak.push({ i, t0: T });
    this.lastHp = this.hp;
    if (this.s.iframes) { this.invTotal = this.s.iframesMs / 1000; this.invuln = this.invTotal; }   // 3) DOKUNULMAZLIK
    if (this.s.knockback) this._knock(kd);                                                           // 2) GERİ SAVRULMA
    if (this.hp <= 0) {
      this.st = 'dead'; this.stT = T; this.deaths++; this.invuln = 0; this.vx = 0; this.vy = 0;
      this.audio.play('ko'); this.parts.stars(this.x, this.y - 100, 6);
    }
  }
  // 2) GERİ SAVRULMA: yalnızca hız verir; hasar/dokunulmazlıktan habersiz
  _knock(kd) { this.vx = kd * KB_VX; this.vy = KB_VY; this.grounded = false; this.stun = 0.18; }

  _protected(T) {
    this.contacts++; this.protectedN++; this.protT = T; this.audio.play('tick');
    this.fl.push({ x: this.x, y: this.y - 150, t0: T, s: '0', col: GLOW });
    this.rings.push({ t0: T });
  }

  _dead(T) {
    if (T - this.stT > 0.9) {
      this.x = this.spawn.x; this.y = FLOOR; this.vx = 0; this.vy = 0; this.grounded = true;
      this.hp = MAXHP; this.lastHp = MAXHP; this.invuln = 0; this.contactT = TICK; this.prevIds = new Set(); this.stun = 0;
      this.st = 'play'; this.spawnT = T; this.parts.dust(this.x, this.y, 8); this.audio.play('pop');
    }
  }
  _won(dt, T) {
    this.vx = moveToward(this.vx, 0, DEC * dt); this.x += this.vx * dt;
    if (T - this.stT > 1.0 && !this.completed) this.complete({ text: this.cfg.lesson });
  }
  _camera(dt) {
    const c = this.camera, k = 1 - Math.exp(-5 * dt), hw = this.view.w / 2;
    const tx = clamp(this.x + this.dir * 60, hw - 10, X_MAX + 40 - hw);
    c.x += (tx - c.x) * k; c.y = 300; c.z = 1;
  }

  // ---------------- çizim ----------------
  render(g) {
    const W = this.view.w, H = this.view.h, T = this.time, c = this.camera;
    setBoil(T);
    this._bg(g, W, H, T);
    g.save(); this.applyCamera(g);
    const hx = W / 2 + 60, x0 = c.x - hx, x1 = c.x + hx;
    this._world(g, x0, x1, T);
    const hz = this._hazards();
    for (const h of hz) if (h.cx > x0 - 300 && h.cx < x1 + 300) this._hazard(g, h, T);
    this._mobu(g, T);
    if (this.tech) this._techWorld(g, hz, T);
    this.parts.draw(g);
    this._marks(g, T);
    g.restore();
    const v = g.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, Math.max(W, H) * 0.7);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(60,20,120,.38)'); g.fillStyle = v; g.fillRect(0, 0, W, H);
    this._hud(g, T);
  }

  _bg(g, W, H, T) {
    const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#0d0a14'); gr.addColorStop(0.7, '#150f20'); gr.addColorStop(1, '#0a0810');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    const cx = this.camera.x, f = 0.3, step = 150;
    g.fillStyle = 'rgba(30,22,48,.8)';
    for (let k = Math.floor((cx * f - W / 2) / step) - 1; k <= Math.ceil((cx * f + W / 2) / step) + 1; k++) {
      g.fillRect(k * step - cx * f + W / 2, 90, 46, 400);
    }
    glowAt(g, W / 2, H * 0.55, 360, '139,61,255', 0.08);
  }

  _world(g, x0, x1, T) {
    const a = Math.max(x0, X_MIN - 60), b = Math.min(x1, X_MAX + 60);
    poly(g, [[a, FLOOR], [b, FLOOR], [b, FLOOR + 200], [a, FLOOR + 200]], '#2B2B2B', 8100, 5, HATCH_L);
    g.fillStyle = '#3d3556'; g.fillRect(a, FLOOR, b - a, 11);
    g.fillStyle = 'rgba(182,124,255,.55)'; g.fillRect(a, FLOOR, b - a, 2.5);
    poly(g, [[a, 0], [b, 0], [b, CEIL], [a, CEIL]], '#201830', 8200, 5, HATCH_L);
    g.fillStyle = 'rgba(182,124,255,.4)'; g.fillRect(a, CEIL - 2, b - a, 2.5);
    for (const x of SAW_X) { if (x < x0 - 60 || x > x1 + 60) continue; g.fillStyle = 'rgba(120,110,150,.35)'; g.fillRect(x - 3, CEIL, 6, FLOOR - CEIL); }
    for (const c of this.checks) if (c.x > x0 - 40 && c.x < x1 + 40) this._flag(g, c.x, 78, c.on, c.t0, T, 0.55);
    this._flag(g, GOAL_X, 128, true, -9, T, 1);
  }
  _flag(g, x, h, on, t0, T, sz) {
    const top = FLOOR;
    inkLine(g, [[x, top], [x, top - h]], 9, 8400 + (x | 0) % 50);
    g.strokeStyle = '#b9b2c9'; g.lineWidth = 4; g.lineCap = 'round'; g.beginPath(); g.moveTo(x, top); g.lineTo(x, top - h); g.stroke();
    const rise = on ? eOut(lin(T - t0, 0, 0.45)) : 0, fy = top - h + (1 - rise) * (h - 26) * (on && t0 > -9 ? 1 : 0);
    const wv = Math.sin(T * 5 + x) * 3 * sz, fw = 46 * sz + (sz === 1 ? 20 : 0), fh = 30 * sz + (sz === 1 ? 10 : 0), tipY = on ? fy : top - 26;
    g.beginPath(); g.moveTo(x + 2, tipY); g.quadraticCurveTo(x + fw * 0.5, tipY + wv, x + fw, tipY + fh * 0.45 + wv); g.quadraticCurveTo(x + fw * 0.5, tipY + fh * 0.7 + wv * 0.6, x + 2, tipY + fh); g.closePath();
    g.lineJoin = 'round'; g.strokeStyle = INK; g.lineWidth = 6; g.stroke(); g.fillStyle = on ? PURPLE : '#555062'; g.fill();
    if (on) glowAt(g, x + fw * 0.4, tipY + fh * 0.5, 60 * sz + 20, '139,61,255', 0.4);
    g.fillStyle = '#b9b2c9'; g.beginPath(); g.arc(x, top - h, 5, 0, 7); g.fill(); g.strokeStyle = INK; g.lineWidth = 2.5; g.stroke();
  }

  _hazard(g, h, T) {
    if (h.kind === 'spike') {
      const p = this.sim % SPIKE_CYC, vk = h.k > 0 ? h.k : 0, tip = p > 1.0 && p < 1.2 ? 9 : 5;   // inikken küçük uç, yükselmeden önce büyür
      const ht = vk > 0 ? 8 + 28 * vk : tip, x0 = h.cx - 75, n = 5, w = 150 / n;
      g.lineJoin = 'round';
      for (let i = 0; i < n; i++) {
        const bx = x0 + i * w;
        g.beginPath(); g.moveTo(bx + 1, FLOOR); g.lineTo(bx + w / 2, FLOOR - ht); g.lineTo(bx + w - 1, FLOOR); g.closePath();
        g.fillStyle = h.on ? '#e0384f' : (vk > 0 ? '#a8304a' : '#6a5a78'); g.fill(); g.strokeStyle = INK; g.lineWidth = 3.5; g.stroke();
      }
      if (h.on) glowAt(g, h.cx, FLOOR - 18, 90, '255,60,80', 0.14);
    } else if (h.kind === 'saw') {
      const [cx, cy, r] = h.shapes[0].c;
      g.fillStyle = 'rgba(120,110,150,.5)'; g.fillRect(cx - 2, CEIL, 4, cy - CEIL);
      g.save(); g.translate(cx, cy); g.rotate(T * 9);
      g.beginPath(); const N = 10;
      for (let i = 0; i < N * 2; i++) { const a = i * Math.PI / N, rr = i % 2 ? r * 0.78 : r * 1.12; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      g.closePath(); g.fillStyle = '#c9c3d6'; g.fill(); g.strokeStyle = INK; g.lineWidth = 3.5; g.lineJoin = 'round'; g.stroke();
      g.fillStyle = '#e0384f'; g.beginPath(); g.arc(0, 0, 9, 0, 7); g.fill(); g.stroke();
      g.restore();
    } else {
      const px = h.px, py = CEIL + 6, hx = h.hx, hy = h.hy;
      g.strokeStyle = INK; g.lineWidth = 9; g.lineCap = 'round'; g.beginPath(); g.moveTo(px, py); g.lineTo(hx, hy); g.stroke();
      g.strokeStyle = '#8e86a3'; g.lineWidth = 4; g.stroke();
      g.fillStyle = '#b9b2c9'; g.beginPath(); g.arc(px, py, 7, 0, 7); g.fill(); g.strokeStyle = INK; g.lineWidth = 3; g.stroke();
      g.save(); g.translate(hx, hy); g.rotate(h.th);                     // balta ağzı
      g.beginPath(); g.moveTo(0, -22); g.quadraticCurveTo(38, -10, 30, 26); g.lineTo(-30, 26); g.quadraticCurveTo(-38, -10, 0, -22); g.closePath();
      g.fillStyle = '#c9c3d6'; g.fill(); g.strokeStyle = INK; g.lineWidth = 3.5; g.lineJoin = 'round'; g.stroke();
      g.fillStyle = '#e0384f'; g.fillRect(-28, 18, 56, 6);
      g.restore();
    }
  }

  _mobu(g, T) {
    const m = mk(T, this.x, this.y, S);
    if (this.st === 'dead') {
      pancake(m, eOut(lin(T - this.stT, 0, 0.14))); m.face = 'x'; m.nosh = true; drawMobu(g, m);
      const a = (T - this.stT) * 7;
      for (let i = 0; i < 3; i++) { const aa = a + i * Math.PI * 2 / 3; starPoly(g, this.x + Math.cos(aa) * 34, this.y - 58 + Math.sin(aa) * 8, 8, '#FFD23F', aa, true); }
      return;
    }
    const air = !this.grounded;
    if (this.st === 'won') { m.face = 'proud'; m.armL = ARM_HIP; m.armR = ARM_HIP; landSq(m, T, this.stT, 0.6, 0.3); }
    else if (air) {
      const rising = this.vy < 0;
      m.legL = [-8, -26]; m.legR = [8, -30]; m.hairBounce = rising ? 1.2 : 1.8;
      m.armL = m.armR = lerpArm(ARM_DEF, ARM_UPS, rising ? clamp(-this.vy / 500) : 0.5);
      m.face = 'happy';
    } else if (Math.abs(this.vx) > 15) walk(m, this.phase, this.dir, 1, clamp(Math.abs(this.vx) / RUN, 0.3, 1.1));
    landSq(m, T, this.landT, 1, 0.22);
    if (T - this.protT < 0.4 && this.st === 'play') m.face = 'proud';          // kılıç içinden geçti
    const hu = T - this.hurtT;
    if (hu < 0.55) {                                                            // hasar: yüz + hafif geriye yatma
      m.face = 'O'; m.armL = m.armR = lerpArm(ARM_DEF, ARM_SCARED, 0.8);
      if (this.s.knockback) m.rot = (m.rot || 0) - this.hurtDir * 0.22 * (1 - clamp(hu / 0.55));
    }
    const sp = T - this.spawnT; if (sp < 0.3) { const k = eBack(clamp(sp / 0.3)); m.sx *= lerp(0.5, 1, k); m.sy *= lerp(0.5, 1, k); }
    // dokunulmazlık görseli: 10 Hz yanıp sönme (reduced: sabit yarı saydam)
    let al = 1;
    if (this.invuln > 0) al = this.reduced ? 0.5 : (Math.floor(T * 20) % 2 ? 0.3 : 1);
    g.save(); g.globalAlpha = al; drawMobu(g, m); g.restore();
    const gl = T - this.glintT;
    if (gl < 0.35) glowAt(g, this.x, this.y - 70, 70 * (1 + gl * 2), '182,124,255', 0.5 * (1 - gl / 0.35));
    // süre halkası (kalan oran)
    if (this.invuln > 0) {
      const cx = this.x, cy = this.y - 168, k = this.invuln / this.invTotal;
      g.save(); g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,.5)'; g.beginPath(); g.arc(cx, cy, 13, 0, 7); g.stroke();
      g.strokeStyle = GLOW; g.lineCap = 'round'; g.beginPath(); g.arc(cx, cy, 13, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); g.stroke();
      g.restore();
    }
  }

  _techWorld(g, hz, T) {
    g.save(); g.lineWidth = 1.5;
    for (const h of hz) for (const s of h.shapes) {
      g.strokeStyle = h.on ? 'rgba(255,70,90,.95)' : 'rgba(150,145,160,.7)'; g.beginPath();
      if (s.r) g.rect(s.r[0], s.r[1], s.r[2] - s.r[0], s.r[3] - s.r[1]); else g.arc(s.c[0], s.c[1], s.c[2], 0, 7);
      g.stroke();
    }
    const bx0 = this.x - HALF, by0 = this.y - BH;
    if (this.inContact) for (const h of this.overlaps) for (const s of h.shapes) {
      const r = s.r || [s.c[0] - s.c[2], s.c[1] - s.c[2], s.c[0] + s.c[2], s.c[1] + s.c[2]];
      const ix0 = Math.max(r[0], bx0), iy0 = Math.max(r[1], by0), ix1 = Math.min(r[2], bx0 + HALF * 2), iy1 = Math.min(r[3], this.y);
      if (ix1 > ix0 && iy1 > iy0 && this._shapeHit(s, bx0, by0, bx0 + HALF * 2, this.y)) { g.fillStyle = this.invuln > 0 ? 'rgba(182,124,255,.6)' : 'rgba(255,60,80,.6)'; g.fillRect(ix0, iy0, ix1 - ix0, iy1 - iy0); }
    }
    g.strokeStyle = '#fff'; g.lineWidth = 1.6; g.strokeRect(bx0, by0, HALF * 2, BH);
    // dokunulmazlık çubuğu
    const bw = 64, bx = this.x - bw / 2, by = this.y - 196, k = this.invuln > 0 ? this.invuln / this.invTotal : 0;
    g.fillStyle = 'rgba(0,0,0,.55)'; g.beginPath(); g.roundRect(bx - 2, by - 2, bw + 4, 12, 6); g.fill();
    g.fillStyle = 'rgba(255,255,255,.14)'; g.beginPath(); g.roundRect(bx, by, bw, 8, 4); g.fill();
    if (k > 0) { g.fillStyle = PURPLE; g.beginPath(); g.roundRect(bx, by, Math.max(8, bw * k), 8, 4); g.fill(); }
    txt(g, `${Math.round(this.invuln * 1000)} ms`, this.x, by - 9, 11, k > 0 ? LAV : 'rgba(233,221,255,.6)', 'center', 700, true);
    g.restore();
  }

  _marks(g, T) {
    for (const r of this.rings) {   // korunan temas: göğüste kısa mor kalkan
      const a = (T - r.t0) / 0.5, rad = 22 + 30 * eOut(a);
      g.save(); g.globalAlpha = 1 - a; g.strokeStyle = GLOW; g.lineWidth = 5 * (1 - a) + 1.5;
      g.beginPath(); g.arc(this.x, this.y - 70, rad, 0, 7); g.stroke(); g.restore();
    }
    for (const f of this.fl) {
      const a = T - f.t0, k = eBack(clamp(a / 0.2)), y = f.y - 40 * eOut(clamp(a / 0.9)), al = 1 - lin(a, 0.6, 1.0);
      g.save(); g.globalAlpha = al; g.translate(f.x, y); g.scale(k, k);
      txt(g, f.s, 0, 0, 28, f.col, 'center', 900, false); g.restore();
    }
  }

  _hud(g, T) {
    hearts(g, 12, 12, this.hp, MAXHP, 24);
    for (const h of this.hbreak) {      // kırılan kalp: büyüyüp solar
      const a = (T - h.t0) / 0.7, cx = 12 + h.i * 30 + 12;
      g.save(); g.globalAlpha = 1 - a; txt(g, '✕', cx, 24 - 6 * a, 20 + 10 * a, '#fff', 'center', 900); g.restore();
    }
  }
}
