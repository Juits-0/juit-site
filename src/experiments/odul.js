// odul.js — #06 "Küçücük bir ödülü toplamak neden bu kadar tatmin edici?"
// Aynı parkur, aynı 10 altın, aynı fizik. Tur A: geri bildirim kapalı, Tur B: hepsi açık. Değişen yalnız geri bildirim.
import { Experiment } from '../core/experiment.js';
import { clamp, lin, lerp, eOut, eBack, moveToward, hash01 } from '../core/math.js';
import { INK, PURPLE, LAV, GOLD, FONT, MONO, setBoil, poly, ell, inkLine } from '../core/ink.js';
import { mk, walk, landSq, drawMobu, ARM_UPS, ARM_HIP, ARM_DEF, lerpArm } from '../core/mobu.js';
import { Particles, glowAt, ringFlash } from '../core/fx.js';
import { txt, pill } from '../core/ui.js';

const S = 0.3;
const RUN = 240, GRAV = 1500, JV = -520;
const FLOOR = 470, PODTOP = 444, PODX = 2160, PODHALF = 64, ENDX = 2330;
const N = 10, C0 = 330, CGAP = 170;          // altın: eşit aralık, yer/hava dönüşümlü
const COIN_R = 22, BODY_R = 38, BODY_UP = 60;
const KEYS = ['flash', 'sound', 'particles', 'shake', 'counter', 'reaction'];
const DUR = { flash: 0.12, shake: 0.15, particles: 0.6, counter: 0.4 };   // her efektin gerçek süresi (sn)
const NAMES = { flash: 'PARLAMA', shake: 'SARSINTI', particles: 'PARÇACIK', counter: 'SAYAÇ' };
const FLY = 0.22;                            // "+1" uçuş süresi; kalanı sayaç zıplaması

export default class Odul extends Experiment {
  static id = 'odul';
  static kind = '2d';
  static controls = {
    joystick: 'horizontal', buttons: [{ name: 'jump', label: 'ZIPLA' }], pointer: null,
    hint: '← → ya da A D: koş · Boşluk: zıpla',
    hintTouch: 'Joystick: koş · ZIPLA: zıpla',
  };
  static settings = [
    { key: 'flash', label: 'Parlama', type: 'toggle', value: false, group: 'Geri bildirim' },
    { key: 'sound', label: 'Ses', type: 'toggle', value: false, group: 'Geri bildirim' },
    { key: 'particles', label: 'Parçacık', type: 'toggle', value: false, group: 'Geri bildirim' },
    { key: 'shake', label: 'Ekran sarsıntısı', type: 'toggle', value: false, group: 'Geri bildirim' },
    { key: 'counter', label: 'Sayaç animasyonu', type: 'toggle', value: false, group: 'Geri bildirim' },
    { key: 'reaction', label: 'Mobu tepkisi', type: 'toggle', value: false, group: 'Geri bildirim' },
    { key: 'allOff', label: 'Hepsi kapalı (A)', type: 'button', group: 'Karşılaştır' },
    { key: 'allOn', label: 'Hepsi açık (B)', type: 'button', group: 'Karşılaştır' },
  ];

  init() {
    this.coinDefs = [];
    for (let i = 0; i < N; i++) this.coinDefs.push({ x: C0 + i * CGAP, y: i % 2 === 0 ? FLOOR - 30 : FLOOR - 140, air: i % 2 === 1 });
    this.parts = new Particles(300);
    this._ready = false;
    this.reset();
    this._ready = true;
  }

  _setAll(v) { for (const k of KEYS) if (this.s[k] !== v) { if (this._ready) this.setSetting(k, v); else this.s[k] = v; } }

  reset() {
    this._setAll(false);
    this.tA = 0; this.tB = 0; this.events = 0; this.round = 'A';
    this._course();
  }

  // parkuru baştan kur (altınlar, Mobu, kamera); süreler korunur
  _course() {
    this.parts.clear();
    this.got = this.coinDefs.map(() => false); this.count = 0;
    this.x = 90; this.y = FLOOR; this.vx = 0; this.vy = 0; this.dir = 1; this.grounded = true;
    this.phase = 0; this.landT = -9; this.collT = -9; this.st = 'play'; this.stT = 0; this.fade = 0; this.swapped = false;
    this.flights = []; this.popT = -9; this.fx = {}; this.rings = []; this.padT = -9;
    this.camera.x = this.x + 60; this.camera.y = 300; this.camera.z = 1;
    this.hud(null);
  }

  onSetting(key) {
    if (key === 'allOff') { this._setAll(false); this.round = 'A'; this.tA = 0; this._course(); this.toast('Hepsi kapalı: aynı altınlar, sessiz', 1600); }
    else if (key === 'allOn') { this._setAll(true); this.round = 'B'; this.tB = 0; this._course(); this.toast('Hepsi açık: aynı altınlar, tam his', 1600); }
  }

  gy(x) { return Math.abs(x - PODX) <= PODHALF ? PODTOP : FLOOR; }

  // ---------------- güncelleme ----------------
  update(dt) {
    const T = this.time;
    this.parts.update(dt);
    if (this.st === 'play') this._play(dt, T);
    else if (this.st === 'podium') this._podium(dt, T);
    else if (this.st === 'fade') this._fade(dt, T);
    const c = this.camera, k = 1 - Math.exp(-5 * dt), W = this.view.w;
    const tx = clamp(this.x + this.dir * 60, W / 2 - 30, ENDX - W / 2 + 30);
    c.x += (tx - c.x) * k; c.y = 300; c.z = 1;
    this._hud();
  }

  _play(dt, T) {
    const inp = this.input, ax = inp.axis.x;
    if (this.round === 'A') this.tA += dt; else this.tB += dt;
    if (Math.abs(ax) > 0.15) this.dir = Math.sign(ax);
    const tvx = Math.abs(ax) > 0.15 ? ax * RUN : 0;
    this.vx = moveToward(this.vx, tvx, (this.grounded ? 2400 : 1600) * dt);
    this.x = clamp(this.x + this.vx * dt, 40, ENDX);
    if (inp.pressed('jump') && this.grounded) { this.vy = JV; this.grounded = false; this.audio.play('jump'); this.parts.dust(this.x, this.y, 3); }
    this.vy = Math.min(this.vy + GRAV * dt, 1100);
    const was = this.grounded; this.y += this.vy * dt; this.grounded = false;
    const g = this.gy(this.x);
    if (this.vy >= 0 && this.y >= g) {
      this.y = g; this.grounded = true;
      if (!was) { if (this.vy > 250) { this.audio.play('land'); this.parts.dust(this.x, this.y, 5); } this.landT = T; }
      this.vy = 0;
    }
    if (this.grounded && Math.abs(this.vx) > 20) this.phase += Math.abs(this.vx) * dt * 0.05;
    if (this.grounded && Math.abs(this.vx) > 120 && this.frame % 14 === 0) this.parts.dust(this.x - this.dir * 14, this.y, 1, -this.dir);
    // altın toplama: Mobu gövde dairesi × altın dairesi
    const bx = this.x, by = this.y - BODY_UP;
    this.coinDefs.forEach((c, i) => {
      if (this.got[i]) return;
      if (Math.hypot(bx - c.x, by - c.y) < BODY_R + COIN_R) this._collect(i, T);
    });
    // kürsü
    if (Math.abs(this.x - PODX) < 36 && this.grounded) {
      if (this.count === N) { this.st = 'podium'; this.stT = T; this.vx = 0; }
      else if (T - this.padT > 3) { this.padT = T; this.toast(`Önce 10 altını topla (${this.count}/10)`, 1400); }
    }
  }

  _collect(i, T) {
    const c = this.coinDefs[i], s = this.s, red = this.reduced;
    this.got[i] = true; this.count++; this.collT = T;
    let ev = 0;
    if (s.flash && !red) { this.fx.flash = { t0: T, x: c.x, y: c.y }; ev++; }
    if (s.sound) { this.audio.play('coin'); ev++; }
    if (s.particles) {
      const n = red ? 4 : 10;
      this.parts.burst(c.x, c.y, { n, speed: 240, life: 0.5, size: 5, col: GOLD, kind: 'spark', g: 300 });
      this.parts.burst(c.x, c.y, { n: red ? 2 : 5, speed: 200, life: 0.5, size: 9, col: GOLD, kind: 'star', g: 260 });
      this.fx.particles = { t0: T }; ev++;
    }
    if (s.shake && !red) { this.shake(4); this.fx.shake = { t0: T }; ev++; }
    if (s.counter) { this.flights.push({ t0: T, x: c.x, y: c.y }); this.fx.counter = { t0: T }; ev++; }
    if (s.reaction) ev++;
    this.events += ev;
  }

  _podium(dt, T) {
    this.vx = 0; this.vy = 0; this.y = this.gy(this.x);
    this.x = moveToward(this.x, PODX, 120 * dt);
    if (T - this.stT > 1.4) {
      if (this.round === 'A') {
        this.st = 'fade'; this.stT = T; this.swapped = false;
        this.toast('Aynı altınlar, şimdi hepsi açık', 2200);
      } else if (!this.completed) this.complete({ text: this.cfg.lesson });
    }
  }

  _fade(dt, T) {
    const u = T - this.stT;            // 0..1.1: 0.5 kararır, 0.1 bekler, 0.5 açılır
    this.fade = u < 0.5 ? u / 0.5 : u < 0.6 ? 1 : 1 - (u - 0.6) / 0.5;
    if (u >= 0.5 && !this.swapped) {
      this.swapped = true; this._setAll(true); this.round = 'B'; this.tB = 0; this._course();
      this.st = "fade"; this.stT = T - 0.5; this.swapped = true; this.fade = 1;
    }
    if (u >= 1.1) { this.fade = 0; this.st = 'play'; }
  }

  _hud() {
    const L = [], R = [];
    if (this.reduced) L.push('Hareket azaltma açık: sarsıntı ve parlama kapalı');
    if (this.s.sound && !this.audio.enabled) L.push('Ses kapalı (panelden aç)');
    if (this.tech) {
      L.push(`Tur A süresi: ${this.tA.toFixed(1)} sn`, `Tur B süresi: ${this.tB.toFixed(1)} sn`);
      R.push(`Geri bildirim olayı: ${this.events}`, `Etkin kanal: ${KEYS.filter(k => this.s[k]).length}/6`);
    }
    if (L.length || R.length) this.hud({ left: L, right: R }); else this.hud(null);
  }

  // ---------------- çizim ----------------
  render(g) {
    const W = this.view.w, H = this.view.h, T = this.time, c = this.camera;
    setBoil(T);
    this._bg(g, W, H, T);
    g.save(); this.applyCamera(g);
    this._world(g, c.x - W / 2 - 60, c.x + W / 2 + 60, T);
    this._coins(g, T);
    this._mobu(g, T);
    const fl = this.fx.flash;
    if (fl && T - fl.t0 < DUR.flash) {
      const d = T - fl.t0; glowAt(g, fl.x, fl.y, 120, '245,197,66', 0.9 * (1 - d / DUR.flash));
      ringFlash(g, fl.x, fl.y, d * (0.45 / DUR.flash), 70, 10, '245,197,66');
    }
    this.parts.draw(g);
    if (this.tech) this._techWorld(g);
    g.restore();
    const v = g.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, Math.max(W, H) * 0.7);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(60,20,120,.38)'); g.fillStyle = v; g.fillRect(0, 0, W, H);
    this._ui(g, W, T);
    if (this.fade > 0) { g.fillStyle = `rgba(5,3,10,${this.fade})`; g.fillRect(0, 0, W, H); }
  }

  _bg(g, W, H, T) {
    const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#0d0a14'); gr.addColorStop(0.75, '#150f20'); gr.addColorStop(1, '#0a0810');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    // arkada sade duvar + simetrik pencere dizisi (hafif paralaks)
    const f = 0.85, cx = this.camera.x * (1 - f), step = 260;
    g.fillStyle = '#1a1328'; g.fillRect(0, 70, W, FLOOR - 70 + 40);
    const k0 = Math.floor((this.camera.x * f - W / 2) / step) - 1, k1 = Math.ceil((this.camera.x * f + W / 2) / step) + 1;
    for (let k = k0; k <= k1; k++) {
      const X = k * step + step / 2 - this.camera.x * f + W / 2;
      g.fillStyle = '#0c0914'; g.fillRect(X - 38, 130, 76, 190);
      g.fillStyle = 'rgba(139,61,255,.16)'; g.fillRect(X - 32, 136, 64, 178);
      g.fillStyle = '#2a2040'; g.fillRect(X - 2, 136, 4, 178); g.fillRect(X - 32, 222, 64, 4);
    }
    g.fillStyle = '#241a38'; g.fillRect(0, 70, W, 8); g.fillRect(0, FLOOR - 30, W, 6);
    glowAt(g, W / 2, H * 0.5, 360, '139,61,255', 0.07);
  }

  _world(g, x0, x1, T) {
    // zemin
    const fg = g.createLinearGradient(0, FLOOR, 0, FLOOR + 140); fg.addColorStop(0, '#2e2447'); fg.addColorStop(1, '#14101f');
    g.fillStyle = fg; g.fillRect(x0, FLOOR, x1 - x0, 160);
    g.fillStyle = 'rgba(182,124,255,.55)'; g.fillRect(x0, FLOOR, x1 - x0, 2.5);
    g.globalAlpha = 0.4;
    for (let x = Math.floor(x0 / 120) * 120; x < x1; x += 120) inkLine(g, [[x, FLOOR + 14], [x + 1, FLOOR + 60]], 3, 6100 + (x / 120 | 0));
    g.globalAlpha = 1;
    // kürsü
    if (PODX + 120 > x0 && PODX - 120 < x1) {
      poly(g, [[PODX - PODHALF, PODTOP], [PODX + PODHALF, PODTOP], [PODX + PODHALF, FLOOR + 6], [PODX - PODHALF, FLOOR + 6]], '#3d3556', 6200, 5);
      g.fillStyle = GOLD; g.fillRect(PODX - PODHALF + 3, PODTOP, PODHALF * 2 - 6, 6);
      txt(g, '1', PODX, PODTOP + 22, 20, '#F5C542', 'center', 900);
      if (this.count === N) glowAt(g, PODX, PODTOP - 20, 110, '245,197,66', 0.18);
    }
  }

  _coins(g, T) {
    this.coinDefs.forEach((c, i) => {
      if (this.got[i]) return;
      const bob = c.air ? Math.sin(T * 2 + i) * 3 : 0, cy = c.y + bob;
      const rx = 3 + 15 * Math.abs(Math.sin(T * 3.2 + i * 0.7));          // dönen elips
      poly(g, ell(c.x, cy, rx, 18, 18), GOLD, 6300 + i * 3, 3);
      g.fillStyle = 'rgba(255,240,170,.8)'; g.beginPath(); g.ellipse(c.x - rx * 0.3, cy - 5, Math.max(1, rx * 0.22), 6, 0, 0, 7); g.fill();
    });
  }

  _mobu(g, T) {
    const m = mk(T, this.x, this.y, S);
    const u = T - this.collT;
    const react = this.s.reaction && u >= 0 && u < 0.3;
    if (this.st === 'podium' || (this.st === 'fade' && this.round === 'A' && !this.swapped)) {
      m.face = 'proud'; m.armL = ARM_HIP; m.armR = ARM_HIP; landSq(m, T, this.stT, 0.6, 0.3);
      drawMobu(g, m); return;
    }
    if (!this.grounded) {
      const rising = this.vy < 0;
      m.legL = [-8, -26]; m.legR = [8, -30]; m.hairBounce = rising ? 1.2 : 1.8;
      m.armL = m.armR = lerpArm(ARM_DEF, ARM_UPS, rising ? clamp(-this.vy / 500) : 0.6);
      m.face = 'happy';
    } else if (Math.abs(this.vx) > 15) walk(m, this.phase, this.dir, 1, clamp(Math.abs(this.vx) / RUN, 0.3, 1.1));
    landSq(m, T, this.landT, 1, 0.22);
    m.look = this.dir * 0.6;
    if (!this.s.reaction) m.face = 'flat';
    else if (react) { m.face = 'star'; m.hairBounce = Math.max(m.hairBounce || 0, 2.2 * (1 - u / 0.3) + 0.4); m.sy *= 1 + 0.06 * Math.sin(Math.PI * u / 0.3); }
    drawMobu(g, m);
  }

  _techWorld(g) {
    g.save(); g.lineWidth = 1.6;
    g.setLineDash([5, 4]); g.strokeStyle = 'rgba(233,221,255,.8)';
    g.beginPath(); g.arc(this.x, this.y - BODY_UP, BODY_R, 0, 7); g.stroke();
    this.coinDefs.forEach((c, i) => {
      if (this.got[i]) return;
      g.strokeStyle = 'rgba(245,197,66,.85)'; g.beginPath(); g.arc(c.x, c.y, COIN_R, 0, 7); g.stroke();
    });
    g.restore();
  }

  // ekran uzayı: tur etiketi, sayaç, "+1" uçuşu, kanal çubukları
  _ui(g, W, T) {
    const cx = W - 78, cy = 36;
    // sayaç değeri: uçuştaki "+1"ler henüz varmadıysa sayıya eklenmez
    this.flights = this.flights.filter(f => T - f.t0 < FLY + 0.2);
    const pending = this.flights.filter(f => T - f.t0 < FLY).length;
    const shown = this.s.counter ? this.count - pending : this.count;
    let pk = 0;
    if (this.s.counter) {
      const last = this.flights.filter(f => T - f.t0 >= FLY).pop();
      if (last) pk = clamp((T - last.t0 - FLY) / (DUR.counter - FLY));
    }
    const sc = pk > 0 && pk < 1 ? lerp(1.55, 1, eBack(pk)) : 1;
    g.save(); g.translate(cx, cy); g.scale(sc, sc);
    poly(g, ell(0, 0, 11, 13, 16), GOLD, 6400, 2.5);
    txt(g, `${shown}/${N}`, 18, 1, 20, pk > 0 && pk < 1 ? GOLD : '#F5F5F5', 'left', 900);
    g.restore();
    for (const f of this.flights) {
      const k = (T - f.t0) / FLY; if (k >= 1) continue;
      const [sx, sy] = this.worldToView(f.x, f.y), e = eOut(k);
      const x = lerp(sx, cx, e), y = lerp(sy, cy, e) - Math.sin(Math.PI * k) * 40;
      txt(g, '+1', x, y, 20, GOLD, 'center', 900);
    }
    pill(g, this.round === 'A' ? 'TUR A' : 'TUR B', 40, 22, this.round === 'A' ? '#4a4360' : PURPLE, 13);
    if (this.tech) {
      let y = 52;
      for (const k of ['flash', 'shake', 'particles', 'counter']) {
        if (!this.s[k]) continue;
        const f = this.fx[k], left = f ? clamp(1 - (T - f.t0) / DUR[k]) : 0;
        txt(g, `${NAMES[k]} ${Math.round(DUR[k] * 1000)} ms`, 10, y + 6, 11, LAV, 'left', 700, true);
        g.fillStyle = 'rgba(255,255,255,.14)'; g.beginPath(); g.roundRect(10, y + 12, 110, 6, 3); g.fill();
        if (left > 0) { g.fillStyle = GOLD; g.beginPath(); g.roundRect(10, y + 12, Math.max(6, 110 * left), 6, 3); g.fill(); }
        y += 28;
      }
    }
  }
}
