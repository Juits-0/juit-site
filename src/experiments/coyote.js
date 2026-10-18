// coyote.js — #03 "Oyunlar neden hatalı zıplamalarını affediyor?"
// REFERANS DENEY: diğer deneyler bu dosyanın yapısını örnek alır (ayrıntı: src/core/API.md).
import { Experiment } from '../core/experiment.js';
import { clamp, lin, lerp, eOut, eBack, eIO, moveToward, hash, hash01 } from '../core/math.js';
import { INK, PURPLE, GLOW, LAV, RED, GOLD, FONT, MONO, setBoil, poly, inkLine, HATCH_L } from '../core/ink.js';
import { mk, walk, landSq, pancake, drawMobu, ARM_UPS, ARM_HIP, ARM_DEF, ARM_SCARED, lerpArm } from '../core/mobu.js';
import { Particles, glowAt, starPoly } from '../core/fx.js';
import { txt, pill } from '../core/ui.js';

// ---- fizik sabitleri (px, sn) ----
const S = 0.3;                        // Mobu ölçeği (~140 px)
const HALF = 27, BH = 120;            // çarpışma kutusu 54×120, ayak altı merkezli
const RUN = 260, ACC = 1800, DEC = 2600, AIR_ACC = 1300;
const GRAV = 1500, JV = -560, LOW_G = 2.4;   // LOW_G: tuş bırakılınca yükselirken ek yerçekimi çarpanı
const TOP = 400, PIT = 640;           // platform üstü ve çukur dibi (dünya y)
// parkur: 6 platform, aralarında 5 boşluk. Tam hızla (260 px/s) en uzun atlayış ≈ 248 px;
// son iki boşluk ancak kenarın son pikselinden (ya da coyote ile geç) geçilir.
const WIDTHS = [420, 300, 220, 280, 220, 380];
const GAPS = [150, 200, 228, 238, 244];
const CHECK = [1, 3, 4];              // kontrol noktası olan platformlar

export default class Coyote extends Experiment {
  static id = 'coyote';
  static kind = '2d';
  static controls = {
    joystick: 'horizontal', buttons: [{ name: 'jump', label: 'ZIPLA' }], pointer: null,
    hint: '← → ya da A D: yürü · Boşluk: zıpla (basılı tut = daha yüksek)',
    hintTouch: 'Joystick: yürü · ZIPLA: zıpla',
  };
  static settings = [
    { key: 'coyote', label: 'Coyote time', type: 'toggle', value: true, group: 'Mekanik' },
    { key: 'coyoteMs', label: 'Tolerans', type: 'range', value: 100, min: 0, max: 250, step: 10, unit: 'ms', group: 'Mekanik' },
    { key: 'buffer', label: 'Zıplama tamponu', type: 'toggle', value: false, group: 'Diğer yardımlar' },
    { key: 'bufferMs', label: 'Tampon süresi', type: 'range', value: 100, min: 0, max: 250, step: 10, unit: 'ms', group: 'Diğer yardımlar' },
    { key: 'tryOff', label: 'Kapalı dene', type: 'button', group: 'Karşılaştır' },
    { key: 'tryOn', label: 'Açık dene', type: 'button', group: 'Karşılaştır' },
  ];

  init() {
    // platformlar ve kontrol noktaları
    this.plats = []; let x = -80;
    WIDTHS.forEach((w, i) => { this.plats.push({ x0: x, x1: x + w, top: TOP }); x += w + (GAPS[i] || 0); });
    this.checks = CHECK.map(i => { const p = this.plats[i]; return { pi: i, x: p.x0 + Math.min(70, p.x1 - p.x0 - 60), top: p.top, on: false, t0: -9 }; });
    const last = this.plats[this.plats.length - 1];
    this.goal = { x: last.x0 + 250, top: last.top };
    this.parts = new Particles(260);
    this.marks = [];
    this.reset();
  }

  reset() {
    this.parts.clear(); this.marks.length = 0;
    this.spawn = { x: 120, y: TOP };
    for (const c of this.checks) { c.on = false; c.t0 = -9; }
    this.x = this.spawn.x; this.y = this.spawn.y; this.vx = 0; this.vy = 0;
    this.dir = 1; this.grounded = true; this.wasGrounded = true;
    this.jumped = false; this.fromEdge = false; this.airT = 0; this.ghost = null; this.lateMarked = false; this.bufT = 0;
    this.landT = -9; this.phase = 0; this.st = 'play'; this.stT = 0; this.spawnT = -9;
    this.rescued = 0; this.missed = 0; this.buffered = 0; this.deaths = 0; this.hinted = false; this.ghostFade = 0;
    this.camera.x = this.x; this.camera.y = 300; this.camera.z = 1;
    this.hud(null);
  }

  onSetting(key) {
    if (key === 'tryOff') { this.setSetting('coyote', false); this.reset(); this.toast('Coyote time kapalı: şimdi tekrar dene'); }
    else if (key === 'tryOn') { this.setSetting('coyote', true); this.reset(); this.toast('Coyote time açık'); }
  }

  get coyoteWin() { return this.s.coyote ? this.s.coyoteMs / 1000 : 0; }

  // ---------------- güncelleme ----------------
  update(dt) {
    const inp = this.input, T = this.time;
    this.parts.update(dt);
    this.marks = this.marks.filter(m => T - m.t0 < 1.1);
    if (this.st === 'dead') { this._dead(T); }
    else if (this.st === 'won') { this._won(dt, T); }
    else this._play(dt, T, inp);
    this._camera(dt);
    if (this.tech) this.hud({ left: [`Coyote ile kurtarılan: ${this.rescued}`], right: [`Kaçırılan: ${this.missed}`] });
    else this.hud(null);
  }

  _play(dt, T, inp) {
    const ax = inp.axis.x, jp = inp.pressed('jump'), jh = inp.held('jump');
    if (Math.abs(ax) > 0.15) this.dir = Math.sign(ax);
    // --- yatay hareket ---
    const tvx = Math.abs(ax) > 0.15 ? ax * RUN : 0;
    const acc = this.grounded ? (tvx ? ACC : DEC) : AIR_ACC;
    this.vx = moveToward(this.vx, tvx, acc * dt);
    const px = this.x;
    this.x += this.vx * dt;
    this.x = Math.max(this.plats[0].x0 + HALF, this.x);
    for (const p of this.plats) {        // platform yan duvarları
      if (this.y > p.top + 0.01 && this.y - BH < p.top + 900 && this.x + HALF > p.x0 && this.x - HALF < p.x1) {
        if (this.x < (p.x0 + p.x1) / 2) this.x = p.x0 - HALF; else this.x = p.x1 + HALF;
        this.vx = 0;
      }
    }
    // --- zıplama isteği ---
    const win = this.coyoteWin;
    const canCoyote = !this.grounded && this.fromEdge && !this.jumped && win > 0 && this.airT <= win;
    if (jp) {
      if (this.grounded || canCoyote) this._jump(T, !this.grounded);
      else {
        if (this.fromEdge && !this.jumped && !this.lateMarked && this.airT <= 0.4) {     // geç kalındı
          this.lateMarked = true; this.missed++; this.marks.push({ t0: T, kind: 'late', x: this.x, y: this.y - 150 });
        }
        if (this.s.buffer && this.s.bufferMs > 0) this.bufT = this.s.bufferMs / 1000;
      }
    }
    if (this.bufT > 0) this.bufT -= dt;
    // --- dikey hareket ---
    const g = GRAV * (this.vy < 0 && !jh ? LOW_G : 1);
    this.vy = Math.min(this.vy + g * dt, 1100);
    const py = this.y; this.y += this.vy * dt;
    this.wasGrounded = this.grounded; this.grounded = false;
    for (const p of this.plats) {
      if (this.vy >= 0 && this.x + HALF > p.x0 && this.x - HALF < p.x1 && py <= p.top + 0.5 && this.y >= p.top) { this.y = p.top; this.grounded = true; break; }
    }
    if (this.grounded) {
      const impact = this.vy; this.vy = 0;
      if (!this.wasGrounded) this._land(T, impact);
      this.jumped = false; this.fromEdge = false; this.airT = 0; this.lateMarked = false;
    } else {
      if (this.wasGrounded && !this.jumped) {            // kenardan ayrıldı
        this.fromEdge = true; this.airT = 0; this.lateMarked = false; this.ghost = { x: px, y: py }; this.ghostFade = 1;
      }
      this.airT += dt;
    }
    if (this.grounded && Math.abs(this.vx) > 20) this.phase += Math.abs(this.vx) * dt * 0.05;
    if (this.grounded && Math.abs(this.vx) > 120 && this.frame % 14 === 0) this.parts.dust(this.x - this.dir * 14, this.y, 1, -this.dir);
    // --- kontrol noktaları ---
    for (const c of this.checks) if (!c.on && this.grounded && this.x >= c.x - 20 && this.x <= this.plats[c.pi].x1 && this.x >= this.plats[c.pi].x0) {
      c.on = true; c.t0 = T; this.spawn = { x: c.x, y: c.top }; this.audio.play('pop');
      this.parts.sparks(c.x, c.top - 70, 8, GLOW); this.toast('Kontrol noktası', 1100);
    }
    // --- bayrak ---
    if (this.grounded && this.x >= this.goal.x - 14) {
      this.st = 'won'; this.stT = T; this.audio.play('success'); this.flash(0.22);
      this.parts.confetti(this.goal.x, this.goal.top - 120, 70);
    }
    // --- çukur ---
    if (this.y >= PIT) {
      this.y = PIT; this.vx = 0; this.vy = 0; this.st = 'dead'; this.stT = T; this.deaths++;
      this.audio.play('ko'); this.shake(6); this.parts.stars(this.x, PIT - 100, 6);
      if (!this.s.coyote && this.deaths === 4 && !this.hinted) { this.hinted = true; this.toast('Coyote kapalı: kenarda tek kare gecikme bile düşürüyor', 2600); }
    }
  }

  _jump(T, rescued) {
    this.vy = JV; this.jumped = true; this.grounded = false; this.fromEdge = false;
    this.audio.play('jump'); this.parts.dust(this.x, this.y, 4);
    if (rescued && this.airT > 0.016) {
      this.rescued++; this.marks.push({ t0: T, kind: 'coyote', x: this.x, y: this.y - 150 });
    }
  }
  _land(T, impact) {
    if (impact > 250) { this.audio.play('land'); this.parts.dust(this.x, this.y, 6); }
    this.landT = T;
    if (this.bufT > 0 && this.s.buffer) {                 // tampondaki zıplama
      this.bufT = 0; this.buffered++; this._jump(T, false); this.marks.push({ t0: T, kind: 'buffer', x: this.x, y: this.y - 150 });
    }
  }

  _dead(T) {
    this.vx = 0;
    if (T - this.stT > 0.6) {                              // hızlı yeniden doğuş
      this.x = this.spawn.x; this.y = this.spawn.y; this.vx = 0; this.vy = 0; this.grounded = true; this.wasGrounded = true;
      this.jumped = false; this.fromEdge = false; this.airT = 0; this.ghost = null; this.bufT = 0; this.st = 'play'; this.spawnT = T;
      this.parts.dust(this.x, this.y, 8); this.audio.play('pop');
    }
  }
  _won(dt, T) {
    this.vx = moveToward(this.vx, 0, DEC * dt); this.x += this.vx * dt;
    if (T - this.stT > 1.0 && !this.completed) this.complete({ text: this.cfg.lesson });
  }

  _camera(dt) {
    const c = this.camera, k = 1 - Math.exp(-5 * dt);
    const tx = this.x + this.dir * 70, ty = 300 + clamp((this.y - TOP) * 0.35, -25, 130);
    c.x += (tx - c.x) * k; c.y += (ty - c.y) * k; c.z = 1;
  }

  // ---------------- çizim ----------------
  render(g) {
    const W = this.view.w, H = this.view.h, T = this.time, c = this.camera;
    setBoil(T);
    this._bg(g, W, H, T);
    g.save(); this.applyCamera(g);
    const hx = W / 2 + 40;
    this._world(g, c.x - hx, c.x + hx, T);
    this._mobu(g, T);
    if (this.tech) this._techWorld(g, T);
    this.parts.draw(g);
    this._marks(g, T);
    g.restore();
    // ekran uzayı: mor kenar vinyeti
    const v = g.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, Math.max(W, H) * 0.7);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(60,20,120,.38)'); g.fillStyle = v; g.fillRect(0, 0, W, H);
  }

  _bg(g, W, H, T) {
    const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#0d0a14'); gr.addColorStop(0.7, '#150f20'); gr.addColorStop(1, '#0a0810');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    const cx = this.camera.x, cy = this.camera.y;
    // uzak taş sütunlar (yavaş kayan)
    for (const [f, a, hMul] of [[0.18, 0.5, 1], [0.38, 0.8, 0.7]]) {
      g.fillStyle = `rgba(${f < 0.3 ? '28,20,44' : '36,26,58'},${a})`;
      const step = f < 0.3 ? 170 : 130, k0 = Math.floor((cx * f - W / 2) / step) - 1, k1 = Math.ceil((cx * f + W / 2) / step) + 1;
      for (let k = k0; k <= k1; k++) {
        const hh = (120 + hash01(k * 7 + (f < 0.3 ? 1 : 2)) * 200) * hMul, w = 50 + hash01(k * 3 + 5) * 40, X = k * step - cx * f + W / 2;
        g.fillRect(X, H - 120 - hh - (cy - 300) * f * 0.4, w, hh + 300);
      }
    }
    // küçük ışık noktaları
    for (let i = 0; i < 26; i++) {
      const X = ((hash01(i * 13) * 1600 - cx * 0.3) % 1600 + 1600) % 1600 / 1600 * (W + 80) - 40, Y = hash01(i * 29) * H * 0.7;
      g.fillStyle = `rgba(182,124,255,${0.08 + 0.1 * Math.abs(Math.sin(T * 0.8 + i))})`; g.fillRect(X, Y, 3, 3);
    }
    glowAt(g, W / 2, H * 0.55, 380, '139,61,255', 0.08);
  }

  _world(g, x0, x1, T) {
    const P = this.plats;
    // çukur araları
    for (let i = 0; i < P.length - 1; i++) {
      const a = P[i].x1, b = P[i + 1].x0; if (b < x0 || a > x1) continue;
      const gr = g.createLinearGradient(0, TOP, 0, PIT); gr.addColorStop(0, '#0a0710'); gr.addColorStop(1, '#1e1530');
      g.fillStyle = gr; g.fillRect(a - 2, TOP, b - a + 4, PIT - TOP);
      poly(g, [[a - 6, PIT], [b + 6, PIT], [b + 6, PIT + 160], [a - 6, PIT + 160]], '#241a38', 7000 + i * 5, 5);
      glowAt(g, (a + b) / 2, PIT - 4, (b - a) * 0.6, '139,61,255', 0.16, 0.25);
    }
    // platformlar
    P.forEach((p, i) => {
      if (p.x1 < x0 || p.x0 > x1) return;
      poly(g, [[p.x0, p.top], [p.x1, p.top], [p.x1, p.top + 760], [p.x0, p.top + 760]], '#2B2B2B', 7100 + i * 10, 5, HATCH_L);
      g.fillStyle = '#3d3556'; g.fillRect(p.x0 + 2, p.top, p.x1 - p.x0 - 4, 11);
      g.fillStyle = 'rgba(182,124,255,.55)'; g.fillRect(p.x0 + 2, p.top, p.x1 - p.x0 - 4, 2.5);
      g.save(); g.globalAlpha = 0.5;
      for (let x = p.x0 + 36, k = 0; x < p.x1 - 20; x += 76, k++) inkLine(g, [[x, p.top + 26], [x + 2, p.top + 62]], 3, 7200 + i * 20 + k);
      inkLine(g, [[p.x0 + 14, p.top + 62], [p.x1 - 14, p.top + 62]], 3, 7300 + i);
      g.restore();
    });
    // kontrol noktaları
    for (const c of this.checks) if (c.x > x0 - 40 && c.x < x1 + 40) this._flagpole(g, c.x, c.top, 78, c.on, c.t0, T, 0.55);
    this._flagpole(g, this.goal.x, this.goal.top, 128, true, -9, T, 1);
  }
  _flagpole(g, x, top, h, on, t0, T, sz) {
    inkLine(g, [[x, top], [x, top - h]], 9, 7400 + (x | 0) % 50);
    g.strokeStyle = '#b9b2c9'; g.lineWidth = 4; g.lineCap = 'round'; g.beginPath(); g.moveTo(x, top); g.lineTo(x, top - h); g.stroke();
    const rise = on ? eOut(lin(T - t0, 0, 0.45)) : 0, fy = top - h + (1 - rise) * (h - 26) * (on && t0 > -9 ? 1 : 0);
    const wv = Math.sin(T * 5 + x) * 3 * sz;
    const fw = 46 * sz + (sz === 1 ? 20 : 0), fh = 30 * sz + (sz === 1 ? 10 : 0);
    const tipY = on ? fy : top - 26;
    g.beginPath(); g.moveTo(x + 2, tipY); g.quadraticCurveTo(x + fw * 0.5, tipY + wv, x + fw, tipY + fh * 0.45 + wv); g.quadraticCurveTo(x + fw * 0.5, tipY + fh * 0.7 + wv * 0.6, x + 2, tipY + fh); g.closePath();
    g.lineJoin = 'round'; g.strokeStyle = INK; g.lineWidth = 6; g.stroke(); g.fillStyle = on ? PURPLE : '#555062'; g.fill();
    if (on) { glowAt(g, x + fw * 0.4, tipY + fh * 0.5, 60 * sz + 20, '139,61,255', 0.4); if (sz === 1) starPoly(g, x + fw * 0.38, tipY + fh * 0.52 + wv * 0.5, 9, '#fff', 0.3, false); }
    g.fillStyle = '#b9b2c9'; g.beginPath(); g.arc(x, top - h, 5, 0, 7); g.fill(); g.strokeStyle = INK; g.lineWidth = 2.5; g.stroke();
  }

  _mobu(g, T) {
    const m = mk(T, this.x, this.y, S);
    // gölge sadece platformun üstündeyken
    m.nosh = true;
    for (const p of this.plats) if (this.x + HALF > p.x0 && this.x - HALF < p.x1 && this.y <= p.top + 1) { m.nosh = false; m.gy = p.top; }
    const air = !this.grounded && this.st === 'play';
    if (this.st === 'dead') {
      const k = eOut(lin(T - this.stT, 0, 0.14)); pancake(m, k); m.face = 'x'; m.nosh = true;
      drawMobu(g, m);
      const u = T - this.stT, a = u * 7;                  // dönen yıldızlar
      for (let i = 0; i < 3; i++) { const aa = a + i * Math.PI * 2 / 3; starPoly(g, this.x + Math.cos(aa) * 34, this.y - 58 + Math.sin(aa) * 8, 8, '#FFD23F', aa, true); }
      return;
    }
    if (this.st === 'won') {
      m.face = 'proud'; m.armL = ARM_HIP; m.armR = ARM_HIP; landSq(m, T, this.stT, 0.6, 0.3);
    } else if (air) {
      const rising = this.vy < 0;
      m.legL = [-8, -26]; m.legR = [8, -30]; m.hairBounce = rising ? 1.2 : 1.8;
      const ka = rising ? clamp(-this.vy / 500) : 0.5 * (1 - clamp(this.vy / 700)) + 0.35;
      m.armL = m.armR = lerpArm(ARM_DEF, ARM_UPS, ka);
      m.sy *= 1 + 0.05 * clamp(Math.abs(this.vy) / 600); m.sx *= 1 - 0.03 * clamp(Math.abs(this.vy) / 600);
      if (this.y > TOP + 20 && this.vy > 100) { m.face = 'O'; m.armL = m.armR = lerpArm(ARM_DEF, ARM_SCARED, 0.7); }
      else if (this.fromEdge && !this.jumped && this.airT < Math.max(0.2, this.coyoteWin)) m.face = 'o';
      else m.face = 'happy';
    } else if (Math.abs(this.vx) > 15) {
      walk(m, this.phase, this.dir, 1, clamp(Math.abs(this.vx) / RUN, 0.3, 1.1));
    }
    landSq(m, T, this.landT, 1, 0.22);
    const sp = T - this.spawnT; if (sp < 0.3) { const k = eBack(clamp(sp / 0.3)); m.sx *= lerp(0.5, 1, k); m.sy *= lerp(0.5, 1, k); }
    drawMobu(g, m);
  }

  // ---- teknik görünüm: hitbox, hayalet kutu, coyote süre çubuğu ----
  _techWorld(g, T) {
    g.save(); g.lineWidth = 1.6; g.strokeStyle = 'rgba(182,124,255,.9)'; g.strokeRect(this.x - HALF, this.y - BH, HALF * 2, BH);
    if (this.ghost && this.ghostFade > 0) {
      const a = this.fromEdge && !this.grounded ? 1 : 0.0;
      if (a > 0) { g.setLineDash([5, 4]); g.strokeStyle = 'rgba(233,221,255,.75)'; g.strokeRect(this.ghost.x - HALF, this.ghost.y - BH, HALF * 2, BH); g.setLineDash([]); txt(g, 'son yer', this.ghost.x, this.ghost.y + 14, 10, 'rgba(233,221,255,.8)', 'center', 700, true); }
    }
    if (this.fromEdge && !this.grounded && !this.jumped) {
      const win = this.coyoteWin, left = win > 0 ? clamp(1 - this.airT / win) : 0, bw = 64, bx = this.x - bw / 2, by = this.y - 172;
      g.fillStyle = 'rgba(0,0,0,.55)'; g.beginPath(); g.roundRect(bx - 2, by - 2, bw + 4, 12, 6); g.fill();
      g.fillStyle = 'rgba(255,255,255,.14)'; g.beginPath(); g.roundRect(bx, by, bw, 8, 4); g.fill();
      if (left > 0) { g.fillStyle = left > 0.3 ? PURPLE : RED; g.beginPath(); g.roundRect(bx, by, Math.max(8, bw * left), 8, 4); g.fill(); }
      txt(g, `${Math.round(left * win * 1000)} ms`, this.x, by - 9, 11, left > 0 ? LAV : RED, 'center', 700, true);
    }
    g.restore();
  }
  _marks(g, T) {
    for (const m of this.marks) {
      if (!this.tech) continue;
      const a = T - m.t0, k = eBack(clamp(a / 0.22)), y = m.y - 26 * eOut(clamp(a / 0.9)), al = 1 - lin(a, 0.6, 1.1);
      g.save(); g.globalAlpha = al; g.translate(m.x, y); g.scale(k, k);
      if (m.kind === 'coyote') pill(g, 'COYOTE ✓', 0, 0, PURPLE, 14);
      else if (m.kind === 'buffer') pill(g, 'TAMPON ✓', 0, 0, GOLD, 14, INK);
      else { // GEÇ! damgası
        g.rotate(-0.14); g.strokeStyle = RED; g.lineWidth = 3; g.fillStyle = 'rgba(30,6,12,.8)'; g.beginPath(); g.roundRect(-34, -15, 68, 30, 6); g.fill(); g.stroke();
        txt(g, 'GEÇ!', 0, 1, 20, RED, 'center', 900);
      }
      g.restore();
    }
  }
}
