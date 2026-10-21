// yukleme.js — #14 "Oyunlar yükleme ekranlarını nasıl gizliyor?"
// Yan görünüş: 4 bölge, aralarında 3 geçiş. Sonraki bölge arka planda GERÇEK bir sayaçla (MB / disk hızı) yüklenir.
// Geçiş yöntemleri: klasik yükleme ekranı / yavaş açılan kapı / dar geçit / asansör. Ayrıntı: src/core/API.md
import { Experiment } from '../core/experiment.js';
import { clamp, lin, lerp, eOut, eBack, moveToward, hash01 } from '../core/math.js';
import { INK, PURPLE, GLOW, LAV, RED, GOLD, GRAY, setBoil, poly, inkLine, HATCH_L } from '../core/ink.js';
import { mk, walk, drawMobu, ARM_HIP, ARM_UPS, lerpArm } from '../core/mobu.js';
import { Particles, glowAt } from '../core/fx.js';
import { txt, pill, bar } from '../core/ui.js';

// ---- sabitler (px, sn) ----
const S = 0.32;                         // Mobu ölçeği (~150 px)
const GY = 400, CEIL = 100;             // zemin ve tavan (dünya y)
const RW = 520, GW = 150, P = RW + GW;  // bölge genişliği, geçiş genişliği, adım
const NREG = 4;
const MBS = [80, 90, 120, 150];         // bölge başına MB (bölge 1 oyun başında bellekte)
const RUN = 190, ACC = 1400, DEC = 2400, CRAWL = 34;
const PRE = 480;                        // önden yükleme: geçide bu kadar yaklaşınca başlar
const MINRIDE = 2.0;                    // asansör en az bu kadar sn yolculuk yapar
const TCOLS = 4, TROWS = 5;             // kapı arkası karo ızgarası
const VOID = '#040207';

export default class Yukleme extends Experiment {
  static id = 'yukleme';
  static kind = '2d';
  static controls = {
    joystick: 'horizontal', buttons: [], pointer: null,
    hint: '← → ya da A D: yürü',
    hintTouch: 'Joystick: yürü',
  };
  static settings = [
    { key: 'method', label: 'Gizleme yöntemi', type: 'select', value: 'kapi', group: 'Yükleme', options: [
      { value: 'klasik', label: 'Klasik yükleme ekranı' },
      { value: 'kapi', label: 'Yavaş açılan kapı' },
      { value: 'gecit', label: 'Dar geçit' },
      { value: 'asansor', label: 'Asansör' },
    ] },
    { key: 'disk', label: 'Disk hızı', type: 'range', value: 30, min: 5, max: 100, step: 5, unit: 'MB/sn', group: 'Yükleme' },
    { key: 'prefetch', label: 'Arka planda önden yükle', type: 'toggle', value: true, group: 'Yükleme' },
    { key: 'tryClassic', label: 'Klasik ekranı dene', type: 'button', group: 'Karşılaştır' },
    { key: 'tryDoor', label: 'Kapıyı dene', type: 'button', group: 'Karşılaştır' },
  ];

  init() {
    this.parts = new Particles(200);
    this.reset();
  }

  reset() {
    this.parts.clear();
    this.reg = MBS.map((mb, k) => ({ mb, got: k === 0 ? mb : 0, st: k === 0 ? 'yuklu' : 'bos', show: k === 0 ? 1 : 0, tL: -9 }));
    this.gates = [0, 1, 2].map(() => ({ open: 0, passed: false, entered: false, rideT: 0, ec: 0, ex: 0, closed: false }));
    this.cur = 0; this.x = 110; this.vx = 0; this.dir = 1; this.phase = 0; this.minX = 20;
    this.st = 'play'; this.stT = 0; this.happyT = -9;
    this.ovA = 0; this.screenT = 0; this.waitT = 0; this.waitNow = 0; this.stalled = false;
    this.camera.x = this.x + 70; this.camera.y = 300; this.camera.z = 1;
    this.hud(null);
  }

  onSetting(key) {
    if (key === 'tryClassic') { this.setSetting('method', 'klasik'); this.setSetting('prefetch', false); this.reset(); this.toast('Klasik: ekran kararır, bar dolana kadar oyun durur'); }
    else if (key === 'tryDoor') { this.setSetting('method', 'kapi'); this.setSetting('prefetch', true); this.reset(); this.toast('Kapının açıklığı = yükleme yüzdesi'); }
    else if (key === 'method' && this.reg) this.reset();
  }

  // geçiş i: bölge i ile i+1 arası
  _geo(i) { const gx0 = i * P + RW, gx1 = (i + 1) * P; return { gx0, gx1, cx: (gx0 + gx1) / 2 }; }
  get goalX() { return 3 * P + 400; }

  // ---------------- güncelleme ----------------
  update(dt) {
    const T = this.time;
    this.parts.update(dt);
    for (const r of this.reg) r.show += clamp((r.st === 'yuklu' ? 1 : 0) - r.show, -dt * 2, dt * 1.6);
    if (this.st === 'won') {
      this.vx = moveToward(this.vx, 0, DEC * dt); this.x += this.vx * dt;
      this.ovA = moveToward(this.ovA, 0, dt * 4);
      if (T - this.stT > 1.0 && !this.completed) this._finish();
    } else this._play(dt, T);
    this._gates(dt, T);
    this._camera(dt);
    this._hud();
  }

  _play(dt, T) {
    const method = this.s.method, inp = this.input, cur = this.cur, last = cur >= NREG - 1;
    const ge = last ? null : this._geo(cur), nx = last ? null : this.reg[cur + 1], gt = last ? null : this.gates[cur];
    // --- arka plan yükleme: tek disk akışı, sıradaki bölge ---
    if (!last && nx.st === 'bos') {
      const pre = this.s.prefetch && this.x >= ge.gx0 - PRE;
      const hard = method === 'klasik' ? this.x >= ge.cx - 6 : this.x >= ge.gx0 - 8;
      if (pre || hard) nx.st = 'yuk';
    }
    if (!last && nx.st === 'yuk') {
      nx.got = Math.min(nx.mb, nx.got + this.s.disk * dt);
      if (nx.got >= nx.mb) {
        nx.st = 'yuklu'; nx.tL = T; this.audio.play('pop');
        this.parts.sparks(ge.cx, GY - 100, 8, GLOW);
      }
    }
    // --- asansör: kabine girince giriş kapısı kapanır, yolculuk başlar ---
    let rideDone = true, riding = false;
    if (!last && method === 'asansor') {
      if (!gt.entered && this.x >= ge.gx0 + 60) { gt.entered = true; gt.rideT = 0; this.minX = Math.max(this.minX, ge.gx0 + 50); this.audio.play('tick'); }
      if (gt.entered) gt.rideT += dt;
      rideDone = gt.entered && gt.rideT >= MINRIDE && nx.st === 'yuklu';
      riding = gt.entered && !rideDone;
    }
    // --- engel: sonraki bölge yüklenmeden (asansörde yolculuk bitmeden) geçilmez ---
    let blocked = false, bx = Infinity;
    if (!last) {
      blocked = nx.st !== 'yuklu' || (method === 'asansor' && !rideDone);
      bx = method === 'klasik' ? ge.cx : method === 'kapi' ? ge.cx - 29 : method === 'gecit' ? ge.gx1 - 42 : ge.gx1 - 40;
    }
    this.stalled = blocked && method !== 'asansor' && this.x >= bx - 2;
    this.waitNow = this.stalled ? this.waitNow + dt : (riding ? this.waitNow + dt : 0);
    if (this.stalled) this.waitT += dt;
    this.ovA = moveToward(this.ovA, method === 'klasik' && this.stalled ? 1 : 0, dt * 6);
    if (this.ovA > 0.5) this.screenT += dt;
    // --- hareket ---
    const frozen = (method === 'klasik' && this.stalled) || riding;
    const ax = frozen ? 0 : inp.axis.x;
    if (Math.abs(ax) > 0.15) this.dir = Math.sign(ax);
    let vmax = RUN;
    if (!last && method === 'gecit' && this.x > ge.gx0 + 10 && this.x < ge.gx1) vmax = CRAWL;
    const tvx = Math.abs(ax) > 0.15 ? ax * vmax : 0;
    this.vx = moveToward(this.vx, tvx, (tvx ? ACC : DEC) * dt);
    if (Math.abs(this.vx) > vmax) this.vx = moveToward(this.vx, Math.sign(this.vx) * vmax, DEC * dt);
    this.x += this.vx * dt;
    if (blocked && this.x > bx) { this.x = bx; this.vx = Math.min(this.vx, 0); }
    if (this.x < this.minX) { this.x = this.minX; this.vx = Math.max(this.vx, 0); }
    const maxX = 3 * P + RW - 16; if (this.x > maxX) { this.x = maxX; this.vx = 0; }
    if (Math.abs(this.vx) > 15) this.phase += Math.abs(this.vx) * dt * 0.05;
    if (Math.abs(this.vx) > 120 && this.frame % 14 === 0) this.parts.dust(this.x - this.dir * 14, GY, 1, -this.dir);
    // --- geçiş tamamlandı: bölge değişir, arkadaki bölge bellekten çıkar ---
    if (!last && !blocked && this.x > (cur + 1) * P + 26) {
      gt.passed = true;
      this.reg[cur].st = 'bell'; this.reg[cur].got = 0;
      this.cur = cur + 1; this.minX = this.cur * P + 10; this.happyT = T;
    }
    // --- bayrak ---
    if (this.cur === NREG - 1 && this.x >= this.goalX - 14) {
      this.st = 'won'; this.stT = T; this.audio.play('success'); this.flash(0.2);
      this.parts.confetti(this.goalX, GY - 130, 60);
    }
  }

  // kapı / kabin animasyon değerleri
  _gates(dt, T) {
    const method = this.s.method;
    this.gates.forEach((gt, i) => {
      const nx = this.reg[i + 1], p = nx.st === 'yuklu' ? 1 : nx.got / nx.mb;
      if (method === 'kapi' || method === 'gecit') {
        const was = gt.open;
        gt.open = gt.passed ? Math.max(0, gt.open - 3 * dt) : p;
        if (gt.passed && was > 0 && gt.open <= 0) this._thump(i);
      } else if (method === 'asansor') {
        gt.ec = gt.entered ? Math.min(1, gt.ec + 3 * dt) : 0;
        const done = gt.entered && gt.rideT >= MINRIDE && nx.st === 'yuklu';
        const was = gt.ex;
        gt.ex = gt.passed ? Math.max(0, gt.ex - 3 * dt) : (done ? Math.min(1, gt.ex + 2.5 * dt) : 0);
        if (gt.passed && was > 0 && gt.ex <= 0) this._thump(i);
      }
    });
  }
  _thump(i) {
    const ge = this._geo(i);
    this.audio.play('land'); this.shake(3); this.parts.dust(ge.cx, GY, 6);
  }

  _camera(dt) {
    const c = this.camera, k = 1 - Math.exp(-5 * dt), W = this.view.w;
    c.x += (this.x + 70 - c.x) * k; c.y = 300;
    const tz = this.tech ? clamp(W / 600, 0.72, 1) : 1;
    c.z += (tz - c.z) * (1 - Math.exp(-4 * dt));
  }

  _hud() {
    if (!this.tech) { this.hud(null); return; }
    const mem = this.reg.filter(r => r.st === 'yuklu').length;
    const mb = this.reg.reduce((a, r) => a + (r.st === 'yuklu' ? r.mb : r.st === 'yuk' ? r.got : 0), 0);
    const left = [`Bellek: ${mem}/${NREG} bölge · ${Math.round(mb)} MB`];
    const ld = this.reg.findIndex(r => r.st === 'yuk');
    left.push(ld >= 0 ? `Yükleniyor: bölge ${ld + 1} · %${Math.floor(this.reg[ld].got / this.reg[ld].mb * 100)}` : 'Yükleme: boşta');
    left.push(`Disk: ${this.s.disk} MB/sn`);
    this.hud({ left, right: [`Yükleme ekranı: ${this.screenT.toFixed(1)} sn`, `Kapıda bekleme: ${this.waitT.toFixed(1)} sn`] });
  }

  _finish() {
    const lesson = this.cfg.lesson, s = this.screenT, w = this.waitT;
    let t;
    if (s > 0.3) t = `Yükleme ekranı karşısında ${s.toFixed(1)} sn bekledin. `;
    else if (w > 0.3) t = `Yükleme ekranı görmedin ama kapıda ${w.toFixed(1)} sn bekledin. `;
    else t = 'Hiç yükleme ekranı görmedin, hiç beklemedin: bölgeler arka planda yüklendi. ';
    this.complete({ title: s > 0.3 ? 'Geçtin, ama beklettin' : 'Yükleme ekranı yok!', text: t + lesson });
  }

  // ---------------- çizim ----------------
  render(g) {
    const W = this.view.w, H = this.view.h, T = this.time;
    setBoil(T);
    this._bg(g, W, H, T);
    g.save(); this.applyCamera(g);
    this._world(g, T);
    for (let i = 0; i < 3; i++) this._gate(g, i, T);
    if (this.tech) this._techWorld(g, T);
    this._mobu(g, T);
    this.parts.draw(g);
    g.restore();
    if (this.ovA > 0.01) this._overlay(g, W, H, T);
    if (this.tech) this._strip(g, W, H, T);
    const v = g.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, Math.max(W, H) * 0.7);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(60,20,120,.38)'); g.fillStyle = v; g.fillRect(0, 0, W, H);
  }

  _bg(g, W, H, T) {
    const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#0d0a14'); gr.addColorStop(0.7, '#150f20'); gr.addColorStop(1, '#0a0810');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    glowAt(g, W / 2, H * 0.5, 360, '139,61,255', 0.07);
  }

  _block(g, x, y, w, h, seed) {
    if (h < 2) return;
    poly(g, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], '#2B2B2B', seed, 5, HATCH_L);
    g.fillStyle = 'rgba(182,124,255,.35)'; g.fillRect(x + 2, y + h - 3, w - 4, 2);
  }

  // asılı kapak: topY'den h boyunda; gap kadar yukarı kayar (duvarın içine girer)
  _slab(g, x, w, topY, h, gap, seed) {
    const vis = h - gap; if (vis < 2) return;
    const y1 = topY + vis;
    poly(g, [[x, topY], [x + w, topY], [x + w, y1], [x, y1]], '#3a3350', seed, 4);
    const bh = Math.min(18, vis);
    for (let j = 0; j < 3; j++) { g.fillStyle = j % 2 ? '#1a1424' : PURPLE; g.fillRect(x + 1.5, y1 - bh + (bh / 3) * j, w - 3, bh / 3); }
    g.fillStyle = 'rgba(233,221,255,.25)'; g.fillRect(x + 3, topY + 2, 2, Math.max(0, vis - 6));
  }

  _world(g, T) {
    const WL = 3 * P + RW;
    // tavan bandı ve zemin (tüm dünya)
    g.fillStyle = '#120d1c'; g.fillRect(-700, 20, WL + 1400, CEIL - 20);
    g.fillStyle = 'rgba(182,124,255,.25)'; g.fillRect(-700, CEIL - 2, WL + 1400, 2);
    g.fillStyle = '#17111f'; g.fillRect(-700, GY, WL + 1400, 260);
    g.fillStyle = '#3d3556'; g.fillRect(-700, GY, WL + 1400, 9);
    g.fillStyle = 'rgba(182,124,255,.55)'; g.fillRect(-700, GY, WL + 1400, 2.5);
    g.save(); g.globalAlpha = 0.45;
    const x0 = this.camera.x - this.view.w, x1 = this.camera.x + this.view.w;
    for (let x = Math.floor(x0 / 90) * 90, k = 0; x < x1; x += 90, k++) inkLine(g, [[x, GY + 26], [x + 2, GY + 58]], 3, 9500 + (x / 90 | 0) % 40);
    g.restore();
    // uç duvarlar
    this._block(g, -700, CEIL - 20, 700, GY - CEIL + 20, 9001);
    this._block(g, WL, CEIL - 20, 700, GY - CEIL + 20, 9002);
    // bölgeler
    for (let k = 0; k < NREG; k++) {
      const r = this.reg[k], rx = k * P;
      if (r.show > 0.01) { g.save(); g.globalAlpha = r.show; this._region(g, k, rx, T, r); g.restore(); }
      if (r.show < 0.99) {
        g.fillStyle = VOID; g.globalAlpha = (1 - r.show) * 0.985; g.fillRect(rx, 0, RW, 600); g.globalAlpha = 1;
      }
    }
  }

  _region(g, k, rx, T, r) {
    g.fillStyle = '#181125'; g.fillRect(rx, CEIL, RW, GY - CEIL);
    glowAt(g, rx + RW / 2, GY - 120, 260, '139,61,255', 0.1);
    const sd = 9100 + k * 40;
    if (k === 0) {                                   // sütunlar
      for (let j = 0; j < 4; j++) { const px = rx + 65 + j * 130; this._block(g, px - 15, GY - 200, 30, 200, sd + j); this._block(g, px - 21, GY - 212, 42, 14, sd + 10 + j); }
    } else if (k === 1) {                            // fenerler
      for (let j = 0; j < 5; j++) {
        const px = rx + 52 + j * 104, sw = Math.sin(T * 1.4 + j) * 0.04 * (this.reduced ? 0 : 1);
        inkLine(g, [[px, CEIL], [px + sw * 90, 190]], 3, sd + j);
        glowAt(g, px + sw * 90, 204, 42, '139,61,255', 0.35 + 0.05 * Math.sin(T * 3 + j));
        poly(g, [[px - 9 + sw * 90, 190], [px + 9 + sw * 90, 190], [px + 9 + sw * 90, 216], [px - 9 + sw * 90, 216]], '#5b3aa8', sd + 10 + j, 4);
      }
    } else if (k === 2) {                            // sandık yığınları (1,2,2,1)
      const hs = [1, 2, 2, 1];
      for (let j = 0; j < 4; j++) for (let c = 0; c < hs[j]; c++) {
        const px = rx + 65 + j * 130, y = GY - 46 * (c + 1);
        poly(g, [[px - 23, y], [px + 23, y], [px + 23, y + 46], [px - 23, y + 46]], '#3a3350', sd + j * 3 + c, 4);
        inkLine(g, [[px - 18, y + 6], [px + 18, y + 40]], 3, sd + 30 + j * 3 + c); inkLine(g, [[px + 18, y + 6], [px - 18, y + 40]], 3, sd + 50 + j * 3 + c);
      }
    } else {                                         // kemerler + bayrak
      for (let j = 0; j < 3; j++) {
        const px = rx + 100 + j * 160;
        this._block(g, px - 44, GY - 190, 14, 190, sd + j); this._block(g, px + 30, GY - 190, 14, 190, sd + 5 + j); this._block(g, px - 52, GY - 206, 104, 16, sd + 10 + j);
      }
      this._flag(g, this.goalX, T);
    }
  }
  _flag(g, x, T) {
    inkLine(g, [[x, GY], [x, GY - 128]], 9, 9300);
    g.strokeStyle = '#b9b2c9'; g.lineWidth = 4; g.lineCap = 'round'; g.beginPath(); g.moveTo(x, GY); g.lineTo(x, GY - 128); g.stroke();
    const wv = Math.sin(T * 5) * 3, tipY = GY - 128;
    g.beginPath(); g.moveTo(x + 2, tipY); g.quadraticCurveTo(x + 33, tipY + wv, x + 66, tipY + 14 + wv); g.quadraticCurveTo(x + 33, tipY + 22 + wv * 0.6, x + 2, tipY + 40); g.closePath();
    g.lineJoin = 'round'; g.strokeStyle = INK; g.lineWidth = 6; g.stroke(); g.fillStyle = PURPLE; g.fill();
  }

  // ---------------- geçitler ----------------
  _gate(g, i, T) {
    const m = this.s.method, ge = this._geo(i), gt = this.gates[i], sd = 9700 + i * 30, cx = ge.cx;
    g.fillStyle = '#110c1a'; g.fillRect(ge.gx0, CEIL, GW, GY - CEIL);     // koridor zemini
    if (m === 'klasik') {                                                   // sade kemer
      this._block(g, cx - 52, GY - 200, 14, 200, sd); this._block(g, cx + 38, GY - 200, 14, 200, sd + 1); this._block(g, cx - 60, GY - 216, 120, 16, sd + 2);
    } else if (m === 'kapi') {
      this._block(g, cx - 34, CEIL - 20, 68, GY - 190 - CEIL + 20, sd);
      this._slab(g, cx - 11, 22, GY - 190, 190, gt.open * 190, sd + 3);
      g.fillStyle = gt.open >= 0.999 ? PURPLE : RED; g.beginPath(); g.arc(cx, GY - 204, 4, 0, 7); g.fill();   // durum ışığı
    } else if (m === 'gecit') {
      this._block(g, ge.gx0 + 2, CEIL - 20, GW - 4, GY - 84 - CEIL + 20, sd);
      g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(ge.gx0 + 2, GY - 84, GW - 4, 84);
      this._slab(g, ge.gx1 - 24, 18, GY - 84, 84, gt.open * 84, sd + 3);
    } else {
      const riding = gt.entered && gt.ex < 0.01 && !gt.passed, sh = riding && !this.reduced ? Math.sin(T * 38) * 0.9 : 0;
      g.save(); g.translate(0, sh);
      this._block(g, ge.gx0 + 2, CEIL - 20, GW - 4, GY - 170 - CEIL + 20, sd);
      g.fillStyle = '#1d1530'; g.fillRect(ge.gx0 + 2, GY - 170, GW - 4, 170);
      g.fillStyle = 'rgba(182,124,255,.3)'; g.fillRect(ge.gx0 + 2, GY - 170, GW - 4, 3);
      for (let j = -1; j <= 1; j++) { g.fillStyle = riding && ((T * 3) | 0) % 3 === j + 1 ? GLOW : '#4a4258'; g.fillRect(cx + j * 16 - 5, GY - 160, 10, 5); }
      this._slab(g, ge.gx0 + 2, 18, GY - 170, 170, (1 - gt.ec) * 170, sd + 3);
      this._slab(g, ge.gx1 - 20, 18, GY - 170, 170, gt.ex * 170, sd + 6);
      g.restore();
    }
  }

  // ---------------- Mobu ----------------
  _bored(m, T, wt) {
    if (wt < 0.6) return;
    m.face = 'flat'; m.armL = m.armR = ARM_HIP;
    const c = (wt - 0.6) % 4.2;
    if (c < 2.6) m.legR = [9, -7 * Math.max(0, Math.sin(T * 11))];       // ayak tıpırdatır
    else { const k = Math.sin((c - 2.6) / 1.6 * Math.PI); m.armL = m.armR = lerpArm(ARM_HIP, ARM_UPS, k); if (k > 0.2) m.face = 'O'; m.sy *= 1 + 0.04 * k; }  // esner
  }
  _mobu(g, T) {
    const m = mk(T, this.x, GY, S), last = this.cur >= NREG - 1, method = this.s.method;
    const ge = last ? null : this._geo(this.cur), gt = last ? null : this.gates[this.cur];
    const moving = Math.abs(this.vx) > 12;
    const crawl = !last && method === 'gecit' && this.x > ge.gx0 + 10 && this.x < ge.gx1;
    const riding = !last && method === 'asansor' && gt.entered && gt.ex < 0.01 && !gt.passed;
    if (moving) walk(m, this.phase, this.dir, 1, clamp(Math.abs(this.vx) / RUN, 0.3, 1.1) * (crawl ? 0.6 : 1));
    if (crawl) { m.sy *= 0.5; m.sx *= 1.12; if (!moving) m.face = 'flat'; }
    else if (this.st === 'won') { m.face = 'proud'; m.armL = m.armR = ARM_HIP; }
    else if (!moving && (this.stalled || riding)) { if (riding) m.lookY = -0.8; this._bored(m, T, this.waitNow); }
    else if (T - this.happyT < 0.8) m.face = 'happy';
    drawMobu(g, m);
  }

  // klasik yükleme ekranı (Mobu üstte sıkılmış hâlde durur)
  _overlay(g, W, H, T) {
    g.fillStyle = `rgba(6,3,12,${0.96 * this.ovA})`; g.fillRect(0, 0, W, H);
    const nx = this.reg[Math.min(this.cur + 1, NREG - 1)], p = clamp(nx.got / nx.mb);
    g.save(); g.globalAlpha = this.ovA;
    txt(g, 'YÜKLENİYOR' + '.'.repeat(1 + ((T * 2.5) | 0) % 3), W / 2, 112, 26, '#E9DDFF', 'center', 900);
    const bw = Math.min(W - 80, 420);
    bar(g, W / 2 - bw / 2, 150, bw, 14, p, PURPLE, 'rgba(255,255,255,.12)');
    txt(g, `${Math.round(nx.got)} / ${nx.mb} MB · %${Math.floor(p * 100)}`, W / 2, 188, 14, LAV, 'center', 700, true);
    g.restore();
    glowAt(g, this.view.w / 2, GY - 6, 120, '139,61,255', 0.12 * this.ovA);
    g.save(); this.applyCamera(g); this._mobu(g, T); g.restore();      // Mobu karartmanın üstünde
  }

  // ---------------- teknik görünüm ----------------
  _techWorld(g, T) {
    const hy = CEIL + 30, bw = (RW - 16) / TCOLS, bh = (GY - hy - 8) / TROWS;
    for (let k = 0; k < NREG; k++) {
      const r = this.reg[k], rx = k * P, here = k === this.cur;
      g.save();
      if (r.st === 'yuklu') {
        g.strokeStyle = 'rgba(182,124,255,.35)'; g.lineWidth = 1.4; g.strokeRect(rx + 3, CEIL + 3, RW - 6, GY - CEIL - 6);
        txt(g, `BÖLGE ${k + 1} · YÜKLÜ${here ? ' · burada' : ''}`, rx + 12, CEIL + 18, 12, LAV, 'left', 700, true);
      } else {
        g.setLineDash([7, 5]); g.strokeStyle = r.st === 'bell' ? 'rgba(160,150,180,.6)' : 'rgba(182,124,255,.7)'; g.lineWidth = 1.6;
        g.strokeRect(rx + 3, CEIL + 3, RW - 6, GY - CEIL - 6); g.setLineDash([]);
        const lab = r.st === 'yuk' ? `BÖLGE ${k + 1} · YÜKLENİYOR %${Math.floor(r.got / r.mb * 100)}` : r.st === 'bell' ? `BÖLGE ${k + 1} · bellekten çıkarıldı` : `BÖLGE ${k + 1} · bellekte değil`;
        txt(g, lab, rx + 12, CEIL + 18, 12, r.st === 'bell' ? GRAY : LAV, 'left', 700, true);
        if (r.st === 'yuk') {                       // karo karo yükleme
          const n = r.got / r.mb * TCOLS * TROWS;
          for (let t = 0; t < TCOLS * TROWS; t++) {
            const c = t % TCOLS, rw = (t / TCOLS) | 0, x = rx + 8 + c * bw, y = hy + rw * bh;
            if (t + 1 <= n) { g.fillStyle = 'rgba(139,61,255,.5)'; g.fillRect(x + 2, y + 2, bw - 4, bh - 4); }
            else if (t < n) { g.fillStyle = `rgba(182,124,255,${0.2 + (n - t) * 0.5})`; g.fillRect(x + 2, y + 2, bw - 4, bh - 4); }
            g.strokeStyle = t < n ? 'rgba(233,221,255,.55)' : 'rgba(182,124,255,.22)'; g.lineWidth = 1; g.strokeRect(x + 2, y + 2, bw - 4, bh - 4);
          }
        }
      }
      g.restore();
    }
    // gizli yükleme çubuğu (sıradaki geçidin üstünde)
    if (this.cur < NREG - 1) {
      const nx = this.reg[this.cur + 1], ge = this._geo(this.cur), cx = ge.cx;
      if (nx.st === 'yuk') {
        const p = nx.got / nx.mb, vis = this.s.method === 'klasik' && this.ovA > 0.5;
        pill(g, vis ? 'GÖRÜNÜR YÜKLEME' : 'GİZLİ YÜKLEME', cx, CEIL + 22, vis ? RED : PURPLE, 13);
        bar(g, cx - 62, CEIL + 38, 124, 10, p, vis ? RED : GLOW, 'rgba(255,255,255,.14)');
        txt(g, vis ? 'ekranda' : 'ARKA PLANDA', cx, CEIL + 64, 12, LAV, 'center', 800, true);
        txt(g, `${Math.round(nx.got)} / ${nx.mb} MB`, cx, CEIL + 80, 12, LAV, 'center', 700, true);
        if (this.s.method === 'kapi') txt(g, `açıklık = %${Math.floor(p * 100)}`, cx, CEIL + 96, 12, '#E9DDFF', 'center', 700, true);
      }
    }
  }

  _strip(g, W, H, T) {
    const n = NREG, gap = 8, bw = Math.min(112, (W - 40 - (n - 1) * gap) / n), bh = 38, tot = n * bw + (n - 1) * gap, x0 = (W - tot) / 2, y = W < 700 ? 44 : 470;
    g.fillStyle = 'rgba(8,4,16,.62)'; g.beginPath(); g.roundRect(x0 - 12, y - 30, tot + 24, 118, 10); g.fill();
    txt(g, 'LEVEL STREAMING', W / 2, y - 14, 12, LAV, 'center', 800, true);
    for (let k = 0; k < n; k++) {
      const r = this.reg[k], x = x0 + k * (bw + gap), p = r.st === 'yuklu' ? 1 : r.got / r.mb;
      g.save();
      if (r.st === 'yuklu') { g.fillStyle = 'rgba(139,61,255,.6)'; g.fillRect(x, y, bw, bh); g.strokeStyle = LAV; g.lineWidth = 1.5; g.strokeRect(x, y, bw, bh); }
      else if (r.st === 'yuk') {
        g.fillStyle = 'rgba(139,61,255,.14)'; g.fillRect(x, y, bw, bh);
        g.fillStyle = 'rgba(182,124,255,.55)'; g.fillRect(x, y, bw * p, bh);
        g.strokeStyle = LAV; g.lineWidth = 1.5; g.strokeRect(x, y, bw, bh);
      } else { g.setLineDash([5, 4]); g.strokeStyle = r.st === 'bell' ? GRAY : 'rgba(182,124,255,.45)'; g.lineWidth = 1.4; g.strokeRect(x, y, bw, bh); }
      g.restore();
      const lab = r.st === 'yuklu' ? 'YÜKLÜ' : r.st === 'yuk' ? `%${Math.floor(p * 100)}` : r.st === 'bell' ? 'çıkarıldı' : 'henüz yok';
      txt(g, `B${k + 1}`, x + bw / 2, y + 14, 12, '#fff', 'center', 800, true);
      txt(g, lab, x + bw / 2, y + 30, 12, r.st === 'bell' ? GRAY : '#E9DDFF', 'center', 700, true);
      if (k === this.cur) txt(g, '▲ Mobu', x + bw / 2, y + bh + 14, 12, GOLD, 'center', 800, true);
    }
    txt(g, 'tüm dünya ✗ · sadece yakını ✓', W / 2, y + bh + 36, 12, GRAY, 'center', 700, true);
  }
}
