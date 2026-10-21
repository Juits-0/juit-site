// boss.js — #07 "Bosslar neden saldırmadan önce haber veriyor?" (telegraph)
// Yan görünüş arena: Mobu solda, taş golem sağda. Üç saldırı (slam, sweep, shock), her biri hazırlık → aktif → toparlanma.
// Uyarılar (kol kalkar, gözler kızarır, yerde işaret, ses) tek tek kapatılabilir; saldırı sırası her zaman aynı (rng(SEED)).
import { Experiment } from '../core/experiment.js';
import { clamp, lin, lerp, eOut, eBack, S3, rng, hash } from '../core/math.js';
import { INK, PURPLE, GLOW, LAV, RED, GOLD, FONT, MONO, setBoil, poly, inkLine, HATCH_D, HATCH_L } from '../core/ink.js';
import { mk, walk, landSq, pancake, drawMobu, ARM_HEAD, ARM_SCARED, ARM_HIP, ARM_DEF, ARM_UPS, lerpArm } from '../core/mobu.js';
import { bossDraw } from '../core/enemy.js';
import { Particles, glowAt, starPoly } from '../core/fx.js';
import { txt, pill, hearts } from '../core/ui.js';

// ---- dünya (mantıksal px; kamera bunu ekrana sığdırır) ----
const FLOOR = 510;                    // zemin çizgisi (ayak y)
const WL = 40, WR = 680;              // arena duvarları
const BX = 480, BS = 0.4;             // boss ayağı x ve ölçeği (kalkık yumruk ≈ 1000·s px yukarıda)
const S = 0.3;                        // Mobu ölçeği
const HALF = 22, BH = 110;            // Mobu isabet kutusu 44×110
const RUN = 260, ACC = 1800, DEC = 2600, AIR_ACC = 1300, GRAV = 1500, JV = -560;
const X_MIN = WL + 27, X_MAX = BX - 300 * BS - 27;   // Mobu'nun gidebileceği aralık (boss'un içinden geçilmez)
const TX_MIN = BX - 920 * BS;         // sol kolun yere ulaşabildiği en uzak nokta
// ---- saldırılar ----
const ACT = { slam: 0.15, sweep: 0.35, shock: 0.5 };   // aktif aşama süreleri (sn)
const REC = 0.7;                      // toparlanma
const KINDS = ['slam', 'sweep', 'shock'];
const SEED = 7077;
const SLAM_R = 90;                    // slam hedef dairesi yarıçapı
const SWEEP_H = 78, SWEEP_F0 = BX - 160, SWEEP_F1 = WL - 20;   // süpürme: yükseklik, cephe başlangıcı/bitişi
const SHOCK_R0 = 120, SHOCK_R1 = 470, SHOCK_W = 22, SHOCK_H = 46;  // halka: yarıçap aralığı, yarı kalınlık, yükseklik
const GOAL = 8, HEARTS = 3;
const ARM_FIX = BX - 330 * BS;        // shock'ta sol yumruğun indiği x (sağ: simetrik)
const NAME = { slam: 'slam', sweep: 'sweep', shock: 'shock' };
const PH = { windup: 'windup', active: 'active', recovery: 'recovery' };

export default class Boss extends Experiment {
  static id = 'boss';
  static kind = '2d';
  static controls = {
    joystick: 'horizontal', buttons: [{ name: 'jump', label: 'ZIPLA' }], pointer: null,
    hint: '← → ya da A D: yürü · Boşluk: zıpla',
    hintTouch: 'Joystick: yürü · ZIPLA: zıpla',
  };
  static settings = [
    { key: 'signals', label: 'Uyarılar (telegraph)', type: 'toggle', value: true, group: 'İşaretler' },
    { key: 'floorMark', label: 'Yerde uyarı', type: 'toggle', value: true, group: 'İşaretler' },
    { key: 'eyes', label: 'Gözler kırmızı', type: 'toggle', value: true, group: 'İşaretler' },
    { key: 'sfx', label: 'Uyarı sesi', type: 'toggle', value: true, group: 'İşaretler' },
    { key: 'windupMs', label: 'Hazırlık süresi', type: 'range', value: 800, min: 200, max: 1500, step: 50, unit: 'ms', group: 'Zaman' },
    { key: 'tryOff', label: 'Uyarısız dene', type: 'button', group: 'Karşılaştır' },
    { key: 'tryOn', label: 'Uyarılı dene', type: 'button', group: 'Karşılaştır' },
  ];

  init() { this.parts = new Particles(260); this.hitsTotal = 0; this.reset(); }

  reset() {
    this.parts.clear();
    this.rq = rng(SEED);                // aynı saldırı sırası: Mobu'dan bağımsız tek akış
    this.att = null; this.idleT = 1.2; this.lastKind = 'slam'; this.bt = 0;
    this.x = 150; this.y = FLOOR; this.vx = 0; this.vy = 0; this.dir = 1; this.grounded = true; this.phase = 0; this.landT = -9;
    this.hearts = HEARTS; this.escapes = 0; this.hits = 0; this.inv = 0; this.stun = 0; this.hurtAge = 9; this.escAge = 9;
    this.st = 'play'; this.koT = 0; this.winT = 0; this.sdust = 0;
    this._hc = 0; this.hud(null);
    this._cam();
  }

  onSetting(key) {
    if (key === 'tryOff') { this.setSetting('signals', false); this.reset(); this.toast('Uyarılar kapalı: şimdi tekrar dene'); }
    else if (key === 'tryOn') { this.setSetting('signals', true); this.reset(); this.toast('Uyarılar açık: aynı saldırı sırası'); }
  }
  resize() { this._cam(); }

  // kamera: arena genişliğini ekrana sığdırır; zemin ekranın ~%76'sında
  _cam() {
    const W = this.view.w, H = this.view.h, z = clamp(W / 700, 0.55, 1);
    this.camera.x = (WL + WR) / 2; this.camera.z = z; this.camera.y = FLOOR - 0.26 * H / z;
  }

  // ---------------- güncelleme ----------------
  update(dt) {
    this._cam();
    this.parts.update(dt);
    this.hurtAge += dt; this.escAge += dt;
    if (this.inv > 0) this.inv -= dt;
    if (this.stun > 0) this.stun -= dt;
    if (this.st === 'ko') {
      this.koT += dt;
      if (this.koT > 1.0) { this.reset(); this.toast('Yeniden dene', 1200); return; }
      this.bt += dt;
    } else {
      this._boss(dt);
      this._mobuStep(dt);
      if (this.st === 'won') { this.winT += dt; if (this.winT > 1.0 && !this.completed) this.complete({ text: this.cfg.lesson }); }
    }
    this._hudTech();
  }

  _dur(A) { return A.st === 'windup' ? A.wd : A.st === 'active' ? ACT[A.kind] : REC; }

  _boss(dt) {
    const A = this.att, sig = this.s.signals;
    if (!A) {
      this.bt += dt;
      if (this.st === 'play') { this.idleT -= dt; if (this.idleT <= 0) this._start(); }
      return;
    }
    if (!(A.st === 'windup' && sig)) this.bt += dt;     // hazırlıkta (uyarı açıkken) boss durur
    A.t += dt;
    if (A.st === 'windup' && A.t >= A.wd) { A.t -= A.wd; A.st = 'active'; this._impact(A); }
    if (A.st === 'active') {
      this._hitTest(A);
      this._trail(A, dt);
      if (A.t >= ACT[A.kind]) {
        A.t -= ACT[A.kind]; A.st = 'recovery';
        if (!A.touched && this.st === 'play') this._escape();
      }
    }
    if (A.st === 'recovery' && A.t >= REC) { this.att = null; this.idleT = A.nextIdle; }
  }

  _start() {
    const kind = KINDS[Math.floor(this.rq() * 3)], nextIdle = 0.5 + this.rq() * 0.4;
    this.att = { kind, st: 'windup', t: 0, wd: this.s.windupMs / 1000, tx: Math.max(this.x, TX_MIN), hit: false, touched: false, nextIdle };
    this.lastKind = kind;
    if (this.s.signals && this.s.sfx) this.audio.play('warn');
  }

  // ön cephe konumu (sweep) ve halka yarıçapı (shock)
  _front(A) { return lerp(SWEEP_F0, SWEEP_F1, clamp(A.t / ACT.sweep)); }
  _ring(A) { return lerp(SHOCK_R0, SHOCK_R1, clamp(A.t / ACT.shock)); }

  _n(n) { return this.reduced ? Math.ceil(n / 3) : n; }
  _impact(A) {
    this.audio.play('boom');
    if (A.kind === 'slam') { this.shake(6); this.parts.dust(A.tx, FLOOR, this._n(10)); this.parts.sparks(A.tx, FLOOR - 6, this._n(6), GLOW); }
    else if (A.kind === 'sweep') { this.shake(4); this.parts.dust(this._front(A), FLOOR, this._n(6), -1); }
    else { this.shake(6); this.parts.dust(BX - 120, FLOOR, this._n(8), -1); this.parts.dust(BX + 120, FLOOR, this._n(8), 1); }
  }
  _trail(A, dt) {
    this.sdust += dt; if (this.sdust < 0.04) return; this.sdust = 0;
    if (A.kind === 'sweep') this.parts.dust(this._front(A), FLOOR, this._n(2), -1);
    else if (A.kind === 'shock') this.parts.dust(BX - this._ring(A), FLOOR, this._n(2), -1);
  }

  _hitTest(A) {
    const mx = this.x, h = FLOOR - this.y, x0 = mx - HALF, x1 = mx + HALF;
    let hit = false;
    if (A.kind === 'slam') hit = Math.abs(mx - A.tx) < SLAM_R;
    else if (A.kind === 'sweep') { const f = this._front(A); hit = x1 > f - 30 && x0 < f + 60 && h < SWEEP_H; }
    else { const xr = BX - this._ring(A); hit = x1 > xr - SHOCK_W && x0 < xr + SHOCK_W && h < SHOCK_H; }
    if (!hit) return;
    A.touched = true;
    if (this.inv > 0 || A.hit) return;
    A.hit = true; this.hearts--; this.hits++; this.hitsTotal++;
    this.inv = 0.6; this.stun = 0.28; this.hurtAge = 0;
    const kd = A.kind === 'slam' ? (mx >= A.tx ? 1 : -1) : -1;
    this.vx = kd * 300; this.vy = -330; this.grounded = false;
    this.audio.play('hurt'); this.shake(4);
    this.parts.sparks(mx, this.y - 60, this._n(8), RED);
    if (this.hearts <= 0) {
      this.st = 'ko'; this.koT = 0; this.vx = 0; this.vy = 0; this.y = FLOOR; this.grounded = true;
      this.audio.play('ko'); this.parts.stars(mx, FLOOR - 60, this._n(6));
    }
  }

  _escape() {
    this.escapes++; this.escAge = 0; this.audio.play('coin');
    if (this.escapes >= GOAL) {
      this.st = 'won'; this.winT = 0; this.audio.play('success'); this.flash(0.2);
      this.parts.confetti(this.x, FLOOR - 160, this._n(60));
    }
  }

  // ---------------- Mobu fiziği ----------------
  _mobuStep(dt) {
    const inp = this.input, won = this.st === 'won' || this.completed;
    const ax = (won || this.stun > 0) ? 0 : inp.axis.x, jp = !won && this.stun <= 0 && inp.pressed('jump');
    if (Math.abs(ax) > 0.15) this.dir = Math.sign(ax);
    const tvx = Math.abs(ax) > 0.15 ? ax * RUN : 0;
    const acc = this.grounded ? (tvx || this.stun > 0 ? ACC : DEC) : AIR_ACC;
    this.vx = this.stun > 0 ? this.vx * Math.pow(0.02, dt) : this.vx + clamp(tvx - this.vx, -acc * dt, acc * dt);
    this.x = clamp(this.x + this.vx * dt, X_MIN, X_MAX);
    if (this.x <= X_MIN || this.x >= X_MAX) this.vx = 0;
    if (jp && this.grounded) { this.vy = JV; this.grounded = false; this.audio.play('jump'); this.parts.dust(this.x, FLOOR, this._n(4)); }
    this.vy = Math.min(this.vy + GRAV * dt, 1100); this.y += this.vy * dt;
    if (this.y >= FLOOR) {
      if (!this.grounded) { if (this.vy > 250) { this.audio.play('land'); this.parts.dust(this.x, FLOOR, this._n(5)); } this.landT = this.time; }
      this.y = FLOOR; this.vy = 0; this.grounded = true;
    } else this.grounded = false;
    if (this.grounded && Math.abs(this.vx) > 20) this.phase += Math.abs(this.vx) * dt * 0.05;
    if (this.grounded && Math.abs(this.vx) > 120 && ((this.time * 12) | 0) % 2 === 0 && Math.random() < 0.05) this.parts.dust(this.x - this.dir * 14, FLOOR, 1, -this.dir);
  }

  // ---------------- teknik değerler ----------------
  _hudTech() {
    if (!this.tech) { this.hud(null); return; }
    if ((this._hc++ % 6) !== 0) return;
    const A = this.att;
    const l = A ? `Saldırı: ${NAME[A.kind]} · Aşama: ${PH[A.st]} ${A.t.toFixed(2)}/${this._dur(A).toFixed(2)} s` : 'Saldırı: — · Aşama: boşta';
    this.hud({ left: [l], right: [`Kaçış: ${this.escapes} · Vuruş: ${this.hits}`] });
  }
  onTech() { this._hc = 0; this.hud(null); }

  // ---------------- boss duruşu ----------------
  _pose() {
    const A = this.att, sig = !!this.s.signals, eyes = sig && this.s.eyes, T = this.time;
    const arm = () => ({ raise: 0, swing: 0, slam: 0, tx: 0, ty: FLOOR, tr: 0, gl: 0 });
    const B = { x: BX, y: FLOOR, s: BS, bt: this.bt, rt: T, red: 0, narrow: 0, lean: 0, drop: 0, mouth: 0, crack: 1, armL: arm(), armR: arm() };
    if (this.st === 'ko') { B.mouth = 0.5 + 0.5 * Math.abs(Math.sin(T * 14)); B.lean = 0.02 * Math.sin(T * 14); return B; }
    if (!A) { if (this.st === 'won') B.mouth = 0.3; return B; }
    const L = B.armL, R = B.armR, k = A.kind;
    L.tx = A.tx; L.ty = FLOOR;
    if (k === 'shock') { L.tx = ARM_FIX; R.tx = 2 * BX - ARM_FIX; }
    const both = k === 'shock';
    if (A.st === 'windup') {
      const w = A.wd, a = A.t;
      const rk = sig ? eBack(clamp(a / Math.min(0.3, w * 0.5))) : 0, ek = eyes ? eOut(clamp(a / Math.min(0.25, w * 0.4))) : 0;
      B.red = ek; B.narrow = ek;
      if (k === 'sweep') L.swing = rk; else { L.raise = rk; if (both) R.raise = rk; }
      B.lean = 0.05 * rk * (k === 'slam' ? 1 : 0.6);
      if (sig && !this.reduced) { const tr = 7 * S3(lin(a, w * 0.55, w)); L.tr = tr; if (both) R.tr = tr; }
    } else if (A.st === 'active') {
      const d = ACT[k], u = A.t / d, sk = sig ? eOut(clamp(A.t / (k === 'sweep' ? 0.06 : 0.1))) : 1;
      L.slam = sk; if (both) R.slam = sk;
      if (sig) { if (k === 'sweep') L.swing = 1; else { L.raise = 1; if (both) R.raise = 1; } }
      if (k === 'sweep') L.tx = Math.max(this._front(A), TX_MIN);
      B.red = eyes ? 1 : 0; B.narrow = B.red; B.lean = -0.03;
      L.gl = 1 - clamp(u); if (both) R.gl = L.gl;
      if (!this.reduced) { L.tr = 9 * (1 - clamp(A.t / 0.25)); if (both) R.tr = L.tr; }
    } else {
      const t = A.t, hold = 1 - S3(lin(t, 0.45, REC));
      L.slam = hold; if (both) R.slam = hold;
      if (sig) { if (k === 'sweep') L.swing = hold; else { L.raise = hold; if (both) R.raise = hold; } }
      if (k === 'sweep') L.tx = TX_MIN;
      B.drop = 36 * eOut(lin(t, 0, 0.12)) * (1 - S3(lin(t, 0.5, REC)));
      B.mouth = 0.35 * (1 - S3(lin(t, 0.5, REC)));
      B.red = eyes ? 1 - S3(lin(t, 0, 0.3)) : 0; B.narrow = 0;
      L.gl = 0.5 * (1 - lin(t, 0, 0.25)); if (both) R.gl = L.gl;
      if (!this.reduced) { L.tr = 8 * (1 - lin(t, 0, 0.2)); if (both) R.tr = L.tr; }
    }
    return B;
  }

  // ---------------- çizim ----------------
  render(g) {
    const W = this.view.w, H = this.view.h, T = this.time, c = this.camera;
    setBoil(T);
    this._bg(g, W, H, T);
    g.save(); this.applyCamera(g);
    const hx = W / (2 * c.z) + 40, x0 = c.x - hx, x1 = c.x + hx;
    this._floor(g, x0, x1);
    bossDraw(g, this._pose());
    this._marks(g, T);
    this._waves(g, T);
    this._walls(g, x0, x1);
    this._mobu(g, T);
    if (this.tech) this._techWorld(g, T);
    this.parts.draw(g);
    g.restore();
    const v = g.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, Math.max(W, H) * 0.7);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(60,20,120,.38)'); g.fillStyle = v; g.fillRect(0, 0, W, H);
    this._screen(g, W, H, T);
  }

  _bg(g, W, H) {
    const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#0d0a14'); gr.addColorStop(0.7, '#150f20'); gr.addColorStop(1, '#0a0810');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    // uzak taş sütunlar (arena içinde sabit)
    g.save(); this.applyCamera(g);
    for (let k = 0; k < 9; k++) {
      const h = 90 + ((k * 53) % 7) * 34, w = 46 + ((k * 31) % 4) * 14, X = 30 + k * 82;
      g.fillStyle = k % 2 ? 'rgba(30,22,48,.8)' : 'rgba(38,27,60,.7)'; g.fillRect(X, FLOOR - h - 60, w, h + 60);
    }
    glowAt(g, BX, FLOOR - 220, 420, '139,61,255', 0.1);
    g.restore();
  }

  _floor(g, x0, x1) {
    const gr = g.createLinearGradient(0, FLOOR, 0, FLOOR + 40); gr.addColorStop(0, '#2a2040'); gr.addColorStop(1, '#1b1429');
    g.fillStyle = gr; g.fillRect(x0, FLOOR, x1 - x0, 40);
    g.fillStyle = '#100b19'; g.fillRect(x0, FLOOR + 40, x1 - x0, 600);
    g.fillStyle = 'rgba(182,124,255,.55)'; g.fillRect(x0, FLOOR - 1, x1 - x0, 2.5);
    g.fillStyle = 'rgba(182,124,255,.25)'; g.fillRect(x0, FLOOR + 39, x1 - x0, 2);
    g.save(); g.globalAlpha = 0.35;
    for (let x = Math.floor(x0 / 70) * 70; x < x1; x += 70) inkLine(g, [[x, FLOOR + 4], [x - 16, FLOOR + 38]], 3, 7200 + ((x / 70) | 0) % 40);
    g.restore();
  }
  _walls(g, x0, x1) {
    poly(g, [[x0 - 200, -400], [WL, -400], [WL, FLOOR + 700], [x0 - 200, FLOOR + 700]], '#1a1426', 7300, 5, HATCH_D);
    poly(g, [[WR, -400], [x1 + 200, -400], [x1 + 200, FLOOR + 700], [WR, FLOOR + 700]], '#1a1426', 7310, 5, HATCH_D);
    g.fillStyle = 'rgba(182,124,255,.4)'; g.fillRect(WL - 2.5, -400, 2.5, FLOOR + 1100); g.fillRect(WR, -400, 2.5, FLOOR + 1100);
  }

  // yerdeki uyarılar: slam dairesi, sweep şeridi, shock halkası + çatlak. Dolgu kenardan içeri doğru dolar.
  _marks(g, T) {
    const A = this.att, s = this.s;
    if (!A || !s.signals || !s.floorMark) return;
    let p;
    if (A.st === 'windup') p = clamp(A.t / A.wd);
    else if (A.st === 'active') p = 1;
    else p = 0;
    let al = A.st === 'recovery' ? 0 : A.st === 'active' ? 1 - 0.5 * clamp(A.t / ACT[A.kind]) : 1;
    if (al <= 0) return;
    g.save(); g.globalAlpha = al;
    const near = A.st === 'windup' ? 0.7 + 0.3 * Math.sin(T * 24) : 1;
    if (A.kind === 'slam') this._disc(g, A.tx, FLOOR + 16, SLAM_R, 15, p, near);
    else if (A.kind === 'sweep') this._strip(g, p, near, T);
    else this._shockMark(g, p, near, T);
    g.restore();
  }
  _disc(g, cx, cy, rx, ry, p, near) {
    g.fillStyle = `rgba(239,74,92,${0.12 + 0.1 * near})`; g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, 7); g.fill();
    g.fillStyle = `rgba(239,74,92,${0.5 * near + 0.1})`;
    g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, 7); g.ellipse(cx, cy, Math.max(0.01, rx * (1 - p)), Math.max(0.01, ry * (1 - p)), 0, 0, 7, true); g.fill('evenodd');
    g.strokeStyle = RED; g.lineWidth = 3; g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, 7); g.stroke();
  }
  _strip(g, p, near, T) {
    const xa = SWEEP_F0 + 60, xb = WL, y0 = FLOOR + 5, hh = 30;
    g.fillStyle = 'rgba(239,74,92,.14)'; g.fillRect(xb, y0, xa - xb, hh);
    const fx = xa - p * (xa - xb);
    g.fillStyle = `rgba(239,74,92,${0.5 * near + 0.1})`; g.fillRect(fx, y0, xa - fx, hh);
    g.strokeStyle = RED; g.lineWidth = 3; g.strokeRect(xb, y0, xa - xb, hh);
    g.save(); g.beginPath(); g.rect(xb, y0, xa - xb, hh); g.clip(); g.strokeStyle = 'rgba(255,208,214,.7)'; g.lineWidth = 3; g.lineCap = 'round';
    for (let x = xb + 30; x < xa; x += 54) { g.beginPath(); g.moveTo(x + 10, y0 + 6); g.lineTo(x, y0 + hh / 2); g.lineTo(x + 10, y0 + hh - 6); g.stroke(); }
    g.restore();
  }
  _shockMark(g, p, near, T) {
    const jx = Math.sin(T * 55) * 2.2, jy = Math.cos(T * 47) * 1.2;
    this._disc(g, BX + jx, FLOOR + 18 + jy, 168, 26, p, near);
    // çatlaklar: boss ayağından sola doğru, ilerlemeyle uzar
    const len = (BX - 60 - X_MIN + 30) * lin(p, 0, 0.9), pts = [[BX - 130, FLOOR + 14]];
    let x = BX - 130, i = 0; while (BX - 130 - x < len) { x -= 36; pts.push([x, FLOOR + 16 + (i % 2 ? 11 : -3) + hash(i * 3 + 11) * 3]); i++; }
    if (pts.length > 1) {
      g.save(); g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); pts.forEach((q, j) => j ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]));
      g.strokeStyle = 'rgba(239,74,92,.3)'; g.lineWidth = 11; g.stroke(); g.strokeStyle = INK; g.lineWidth = 7; g.stroke(); g.strokeStyle = RED; g.lineWidth = 3; g.stroke(); g.restore();
    }
  }

  // aktif aşama görselleri: sweep dalgası ve shock halkası
  _waves(g, T) {
    const A = this.att; if (!A || A.st !== 'active') return;
    g.save(); g.beginPath(); g.rect(WL, -100, WR - WL, FLOOR + 200); g.clip();
    const fade = 1 - 0.6 * clamp(A.t / ACT[A.kind]);
    if (A.kind === 'sweep') {
      const f = this._front(A);
      const gr = g.createLinearGradient(f + 140, 0, f - 20, 0); gr.addColorStop(0, 'rgba(239,74,92,0)'); gr.addColorStop(1, `rgba(255,208,214,${0.7 * fade})`);
      g.fillStyle = gr; g.beginPath(); g.moveTo(f - 22, FLOOR); g.lineTo(f + 140, FLOOR); g.lineTo(f + 140, FLOOR - SWEEP_H * 0.45); g.lineTo(f + 20, FLOOR - SWEEP_H); g.lineTo(f - 22, FLOOR - SWEEP_H * 0.6); g.closePath(); g.fill();
    } else if (A.kind === 'shock') {
      const r = this._ring(A);
      for (const sg of [-1, 1]) {
        const x = BX + sg * r;
        g.strokeStyle = `rgba(239,74,92,${0.5 * fade})`; g.lineWidth = 5; g.beginPath(); g.ellipse(BX, FLOOR + 18, r, 18, 0, sg < 0 ? Math.PI * 0.5 : -Math.PI * 0.5, sg < 0 ? Math.PI * 1.5 : Math.PI * 0.5); g.stroke();
        const gr = g.createRadialGradient(x, FLOOR - SHOCK_H * 0.35, 2, x, FLOOR - SHOCK_H * 0.35, SHOCK_W * 1.6); gr.addColorStop(0, `rgba(255,208,214,${0.9 * fade})`); gr.addColorStop(1, 'rgba(239,74,92,0)');
        g.fillStyle = gr; g.beginPath(); g.ellipse(x, FLOOR - SHOCK_H * 0.4, SHOCK_W, SHOCK_H * 0.8, 0, 0, 7); g.fill();
        g.strokeStyle = `rgba(239,74,92,${fade})`; g.lineWidth = 3; g.beginPath(); g.ellipse(x, FLOOR - SHOCK_H * 0.4, SHOCK_W * 0.8, SHOCK_H * 0.75, 0, 0, 7); g.stroke();
      }
    }
    g.restore();
  }

  // ---- Mobu ----
  _mobu(g, T) {
    const A = this.att, m = mk(T, this.x, this.y, S);
    m.gy = FLOOR;
    if (this.st === 'ko') {
      pancake(m, eOut(clamp(this.koT / 0.14))); m.face = 'x'; m.y = FLOOR; drawMobu(g, m);
      const a = this.koT * 7;
      for (let i = 0; i < 3; i++) { const aa = a + i * Math.PI * 2 / 3; starPoly(g, this.x + Math.cos(aa) * 34, FLOOR - 56 + Math.sin(aa) * 8, 8, '#FFD23F', aa, true); }
      return;
    }
    const air = !this.grounded, h = FLOOR - this.y;
    const scared = this.s.signals && A && A.st === 'windup' && (A.kind === 'slam' ? Math.abs(this.x - A.tx) < SLAM_R + 40 : h < SWEEP_H);
    if (air) {
      const rising = this.vy < 0;
      m.legL = [-8, -26]; m.legR = [8, -30]; m.hairBounce = rising ? 1.2 : 1.8;
      const ka = rising ? clamp(-this.vy / 500) : 0.5 * (1 - clamp(this.vy / 700)) + 0.35;
      m.armL = m.armR = lerpArm(ARM_DEF, ARM_UPS, ka);
      m.sy *= 1 + 0.05 * clamp(Math.abs(this.vy) / 600); m.sx *= 1 - 0.03 * clamp(Math.abs(this.vy) / 600);
      m.face = 'happy';
    } else if (Math.abs(this.vx) > 15) walk(m, this.phase, this.dir, 1, clamp(Math.abs(this.vx) / RUN, 0.3, 1.1));
    if (this.st === 'won') { m.face = 'proud'; m.armL = m.armR = ARM_HIP; if (!air) landSq(m, T, this.landT, 0.6, 0.3); }
    else if (this.hurtAge < 0.5) { m.face = 'O'; m.armL = m.armR = lerpArm(ARM_DEF, ARM_SCARED, 0.8); m.hairBounce = 1.6; }
    else if (scared) { m.face = 'scared'; m.armL = m.armR = ARM_HEAD; m.sweat = 1; }
    else if (this.escAge < 0.8) { m.face = 'proud'; if (!air) m.armL = m.armR = lerpArm(ARM_DEF, ARM_HIP, eBack(clamp(this.escAge / 0.2))); }
    else m.face = 'happy';
    if (!air) landSq(m, T, this.landT, 1, 0.22);
    const blink = this.inv > 0 && !this.reduced && Math.floor(this.inv * 14) % 2 === 0;
    g.save(); if (blink) g.globalAlpha = 0.35;
    drawMobu(g, m);
    g.restore();
  }

  // ---- teknik görünüm: isabet alanları, Mobu kutusu ----
  _techWorld(g, T) {
    const A = this.att;
    g.save(); g.lineWidth = 1.4; g.strokeStyle = 'rgba(182,124,255,.9)'; g.strokeRect(this.x - HALF, this.y - BH, HALF * 2, BH);
    g.strokeStyle = 'rgba(239,74,92,.95)';
    if (A) {
      const act = A.st === 'active';
      g.setLineDash(act ? [] : [5, 4]);
      if (A.kind === 'slam') {
        g.beginPath(); g.ellipse(A.tx, FLOOR + 16, SLAM_R, 15, 0, 0, 7); g.stroke();
        g.beginPath(); g.moveTo(A.tx - SLAM_R, FLOOR + 16); g.lineTo(A.tx - SLAM_R, FLOOR - 160); g.moveTo(A.tx + SLAM_R, FLOOR + 16); g.lineTo(A.tx + SLAM_R, FLOOR - 160); g.stroke();
      } else if (A.kind === 'sweep') {
        if (act) { const f = this._front(A); g.strokeRect(f - 30, FLOOR - SWEEP_H, 90, SWEEP_H); }
        else { g.beginPath(); g.moveTo(WL, FLOOR - SWEEP_H); g.lineTo(SWEEP_F0 + 60, FLOOR - SWEEP_H); g.stroke(); }
      } else {
        const r = act ? this._ring(A) : SHOCK_R0;
        for (const sg of [-1, 1]) g.strokeRect(BX + sg * r - SHOCK_W, FLOOR - SHOCK_H, SHOCK_W * 2, SHOCK_H);
      }
    }
    g.restore();
  }

  // ---- ekran uzayı: HUD, boss çipi, zaman çizelgesi ----
  _screen(g, W, H, T) {
    hearts(g, 12, 64, this.hearts, HEARTS, 20);
    txt(g, `KAÇIŞ ${this.escapes}/${GOAL}`, W - 12, 75, 16, this.escapes >= GOAL ? GOLD : LAV, 'right', 900);
    if (this.escAge < 0.8 && this.st !== 'ko') {
      const [sx, sy] = this.worldToView(this.x, this.y - 168 - 26 * eOut(clamp(this.escAge / 0.8)));
      g.save(); g.globalAlpha = 1 - lin(this.escAge, 0.5, 0.8); pill(g, 'KAÇIŞ +1', sx, sy, PURPLE, 14); g.restore();
    }
    if (!this.tech) return;
    const A = this.att;
    // boss çipi
    const [cx, cy] = this.worldToView(BX, FLOOR - 1000 * BS - 4);
    let label = 'BOŞTA', col = '#5b5668';
    if (A) {
      const ms = Math.round(A.t * 1000);
      if (A.st === 'windup') { label = `HAZIRLIK ${ms} ms`; col = PURPLE; } else if (A.st === 'active') { label = `AKTİF ${ms} ms`; col = RED; } else { label = `TOPARLANMA ${ms} ms`; col = '#5b5668'; }
    }
    pill(g, label, cx, cy, col, 13);
    this._timeline(g, W, H, A);
  }
  _timeline(g, W, H, A) {
    const k = A ? A.kind : this.lastKind, wd = A ? A.wd : this.s.windupMs / 1000, ad = ACT[k];
    const tot = wd + ad + REC, bw = Math.min(W - 32, 540), x0 = (W - bw) / 2, y = W < 700 ? 138 : H - 46, bh = 16;
    let w1 = bw * wd / tot, w2 = Math.max(8, bw * ad / tot), w3 = bw * REC / tot;
    const sc = bw / (w1 + w2 + w3); w1 *= sc; w2 *= sc; w3 *= sc;
    const segs = [[x0, w1, PURPLE, `HAZIRLIK ${Math.round(wd * 1000)} ms`, 1], [x0 + w1, w2, RED, `AKTİF ${Math.round(ad * 1000)} ms`, 0], [x0 + w1 + w2, w3, '#5b5668', `TOPARLANMA ${Math.round(REC * 1000)} ms`, 1]];
    g.save(); g.globalAlpha = A ? 1 : 0.55;
    g.fillStyle = 'rgba(10,8,16,.78)'; g.beginPath(); g.roundRect(x0 - 8, y - 34, bw + 16, 78, 10); g.fill();
    for (const [sx, sw, col, lb, below] of segs) {
      g.fillStyle = col; g.fillRect(sx, y, sw, bh);
      txt(g, lb, sx + sw / 2, below ? y + bh + 14 : y - 10, 11, below ? LAV : '#ff9aa8', 'center', 700, true);
    }
    g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 1.5; g.strokeRect(x0, y, bw, bh);
    txt(g, `ZAMAN ÇİZELGESİ · ${NAME[k]}`, x0, y - 26, 11, GLOW, 'left', 700, true);
    if (A) {
      const el = A.st === 'windup' ? A.t : A.st === 'active' ? wd + A.t : wd + ad + A.t, cx = x0 + clamp(el / tot) * bw;
      g.fillStyle = '#fff'; g.fillRect(cx - 1.5, y - 5, 3, bh + 10);
      g.beginPath(); g.moveTo(cx - 6, y - 10); g.lineTo(cx + 6, y - 10); g.lineTo(cx, y - 3); g.closePath(); g.fill();
    }
    g.restore();
  }
}
