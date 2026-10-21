// culling.js — #15 "Oyunlarda kameranın görmediği şeyler neden kayboluyor?"
// Kuşbakışı orman: görüş konisi (frustum) + kaya gölgesi (occlusion). Ekran kartı yükü çizilen nesnelerden hesaplanır.
import { Experiment } from '../core/experiment.js';
import { clamp, lin, lerp, eOut, eBack, moveToward, hash01 } from '../core/math.js';
import { INK, PURPLE, GLOW, LAV, RED, FONT, MONO, setBoil, poly } from '../core/ink.js';
import { mk, walk, drawMobu } from '../core/mobu.js';
import { Particles, glowAt } from '../core/fx.js';
import { txt, pill } from '../core/ui.js';

// ---- dünya (px) ----
const WW = 1640, WH = 860;
const START = { x: 150, y: 430 }, EXIT = { x: 1560, y: 430 };
const S = 0.2;                         // Mobu ölçeği (~94 px)
const SPEED = 175;
// ---- yük modeli: yük% = TABAN + (çizilen maliyet toplamı / KAPASITE) * 100 ----
const COST_TREE = 1, COST_ROCK = 2, BASE = 8, CAP = 90;
const TREE_R = 24, ROCK_R = 32;
// ağaç ızgarası: 15 sütun × 9 satır; kayalar simetrik çiftler halinde ızgara noktalarında
const COLS = 15, ROWS = 9, X0 = 300, Y0 = 110, STEP = 80;
const ROCKS = [[2, 2], [2, 6], [6, 3], [6, 5], [9, 1], [9, 7], [12, 3], [12, 5]];

const ad = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };

export default class Culling extends Experiment {
  static id = 'culling';
  static kind = '2d';
  static controls = {
    joystick: true, buttons: [], pointer: 'aim',
    hint: 'WASD / oklar: yürü · Fare: kamerayı çevir',
    hintTouch: 'Joystick: yürü · Ekrana dokun/sürükle: kamerayı çevir',
  };
  static settings = [
    { key: 'frustum', label: 'Frustum culling', type: 'toggle', value: false, group: 'Culling' },
    { key: 'occl', label: 'Occlusion culling', type: 'toggle', value: false, group: 'Culling' },
    { key: 'fov', label: 'Görüş açısı', type: 'range', value: 100, min: 40, max: 140, step: 5, unit: '°', group: 'Kamera' },
    { key: 'far', label: 'Uzak düzlem', type: 'range', value: 480, min: 200, max: 700, step: 20, unit: ' px', group: 'Kamera' },
  ];

  init() {
    this.objs = [];
    const rockSet = new Set(ROCKS.map(([i, j]) => i + ',' + j));
    for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) {
      const x = X0 + i * STEP, y = Y0 + j * STEP, rock = rockSet.has(i + ',' + j);
      const r = rock ? ROCK_R : TREE_R;
      this.objs.push({ rock, x, y, cx: x, cy: y - (rock ? ROCK_R * 0.55 : 32), r, cost: rock ? COST_ROCK : COST_TREE, seed: 3000 + i * 17 + j * 101, st: 0, popT: -9, d: 0, a: 0 });
    }
    this.objs.sort((p, q) => p.y - q.y || p.x - q.x);
    this.rocks = this.objs.filter(o => o.rock);
    this.parts = new Particles(200);
    this.reset();
  }

  reset() {
    this.parts.clear();
    this.x = START.x; this.y = START.y; this.vx = 0; this.vy = 0; this.dir = 1; this.phase = 0;
    this.aimA = 0; this.side = 1; this.sideX = 34; this.ptrT = -9;
    this.O = { x: this.x + 34, y: this.y - 66 };
    this.strikes = 0; this.over = false; this.freeze = 0; this.stutterCd = 0.3; this.hintAcc = 0; this.hintLoadT = -99; this.failT = -99;
    this.st = 'play'; this.stT = 0; this.padT = -9;
    this.drawn = 0; this.nF = 0; this.nO = 0; this.load = 0; this.loadS = 0; this.fps = 60;
    for (const o of this.objs) { o.st = 0; o.popT = -9; }
    this.camera.x = clamp(this.x + 80, this.view.w / 2, WW - this.view.w / 2); this.camera.y = 360; this.camera.z = 1;
    this._cull(true); this.loadS = this.load;
    this.hud(null);
  }

  onSetting(key) {
    if (key === 'frustum' || key === 'occl' || key === 'fov' || key === 'far') { this._cull(true); this.audio.play('click'); }
  }

  // ---------------- culling hesabı ----------------
  _inCone(o) {
    const O = this.O, half = this.s.fov * Math.PI / 360;
    const dx = o.cx - O.x, dy = o.cy - O.y, d = Math.hypot(dx, dy);
    if (d <= o.r) return true;
    if (d - o.r > this.s.far) return false;
    return Math.abs(ad(Math.atan2(dy, dx), this.aimA)) <= half + Math.atan2(o.r, d);
  }

  _cull(silent) {
    const O = this.O, T = this.time, F = this.s.frustum, OC = this.s.occl;
    let sum = 0, drawn = 0, nF = 0, nO = 0;
    // perde: koni içindeki kayalar (gölge kamaları)
    const occl = [];
    if (OC) for (const q of this.rocks) {
      const dx = q.cx - O.x, dy = q.cy - O.y, d = Math.hypot(dx, dy);
      if (d <= q.r + 2 || !this._inCone(q)) continue;
      occl.push({ q, d, a: Math.atan2(dy, dx), hw: Math.asin(q.r / d) });
    }
    this.wedges = occl;
    for (const o of this.objs) {
      const dx = o.cx - O.x, dy = o.cy - O.y; o.d = Math.hypot(dx, dy); o.a = Math.atan2(dy, dx);
      let st = 0;
      if (F && !this._inCone(o)) st = 1;
      else if (OC) {
        for (const w of occl) if (w.q !== o && w.d < o.d && Math.abs(ad(o.a, w.a)) <= w.hw * 0.92) { st = 2; break; }
      }
      if (st === 0 && o.st !== 0 && !silent && T > 0.3) o.popT = T;
      o.st = st;
      if (st === 0) { drawn++; sum += o.cost; } else if (st === 1) nF++; else nO++;
    }
    this.drawn = drawn; this.nF = nF; this.nO = nO;
    this.load = BASE + sum / CAP * 100;
  }

  // ---------------- güncelleme ----------------
  update(dt) {
    const T = this.time, inp = this.input;
    this.parts.update(dt);
    if (this.st === 'won') {
      this.vx = moveToward(this.vx, 0, 900 * dt); this.vy = moveToward(this.vy, 0, 900 * dt);
      this.x += this.vx * dt; this.y += this.vy * dt;
      if (T - this.stT > 1.0 && !this.completed) this.complete({ text: this.cfg.lesson });
    } else this._play(dt, T, inp);
    this._aim(dt, T, inp);
    this._cull(false);
    // yük (hızlı yumuşatma) ve sahte kare hızı
    this.loadS += (this.load - this.loadS) * (1 - Math.exp(-10 * dt));
    this.fps = this.loadS <= 100 ? 60 : Math.max(12, Math.round(6000 / this.loadS));
    if (this.freeze > 0) this.fps = Math.min(this.fps, 18);
    if (this.st === 'play') this._overload(dt, T);
    this._camera(dt);
    if (this.tech) this.hud({
      left: [`ÇİZİLEN ${this.drawn}/${this.objs.length}`, `Koni dışı: ${this.nF}`, `Kaya arkası: ${this.nO}`],
      right: [`Ekran kartı %${Math.round(this.loadS)}`, `${this.fps} fps`],
    });
    else this.hud(null);
  }

  _play(dt, T, inp) {
    const ax = inp.axis.x, ay = inp.axis.y, sp = SPEED * (this.freeze > 0 ? 0.12 : 1);
    this.vx = moveToward(this.vx, ax * sp, 1500 * dt); this.vy = moveToward(this.vy, ay * sp, 1500 * dt);
    this.x = clamp(this.x + this.vx * dt, 40, WW - 40); this.y = clamp(this.y + this.vy * dt, 90, WH - 50);
    if (Math.abs(this.vx) > 12) this.dir = Math.sign(this.vx);
    const spd = Math.hypot(this.vx, this.vy);
    if (spd > 15) this.phase += spd * dt * 0.05;
    if (spd > 100 && this.frame % 16 === 0) this.parts.dust(this.x - this.dir * 10, this.y, 1, -this.dir);
    // giriş platformu: aşım sayacı burada sıfırlanır
    const px = (this.x - START.x) / 70, py = (this.y - START.y) / 34;
    if (px * px + py * py < 1 && this.loadS < 100 && this.strikes > 0) {
      this.strikes = 0; this.padT = T; this.audio.play('pop'); this.parts.sparks(START.x, START.y - 6, 10, GLOW); this.toast('Aşım sayacı sıfırlandı', 1400);
    }
    // çıkış
    if (this.x >= EXIT.x - 40) {
      if (this.strikes === 0) {
        this.st = 'won'; this.stT = T; this.audio.play('success'); this.flash(0.2); this.parts.confetti(EXIT.x, EXIT.y - 80, 60);
      } else if (T - this.failT > 4) {
        this.failT = T; this.audio.play('warn');
        this.toast(`Ekran kartı ${this.strikes} kez boğuldu: girişe dönüp sayacı sıfırla`, 3200);
      }
    }
  }

  _overload(dt, T) {
    const both = this.s.frustum || this.s.occl;
    if (this.loadS >= 100) {
      if (!this.over) {
        this.over = true; this.strikes++; this.stutterCd = 0.1;
        this.audio.play('warn'); this.shake(3);
      }
      this.hintAcc += dt;
      if (this.hintAcc > 3.5 && T - this.hintLoadT > 12) {
        this.hintLoadT = T; this.hintAcc = 0;
        this.toast(both ? 'Görüş açısını ya da uzak düzlemi küçült' : 'Ayarlardan culling\'i dene', 2600);
      }
    } else {
      if (this.loadS < 85) this.over = false;
      this.hintAcc = Math.max(0, this.hintAcc - dt);
    }
    // kekeme: aşım sürerken kısa donmalar
    if (this.over) {
      this.stutterCd -= dt;
      if (this.stutterCd <= 0) { this.freeze = 0.3; this.stutterCd = 0.9; this.shake(2); }
    }
    if (this.freeze > 0) this.freeze -= dt;
  }

  _aim(dt, T, inp) {
    const p = inp.pointer;
    if (Math.abs(p.dx) + Math.abs(p.dy) > 0.5) this.ptrT = T;
    const usePtr = p.down || (p.inside && T - this.ptrT < 2.5);
    let tgt = null;
    if (usePtr) {
      const w = this.viewToWorld(p.x, p.y);
      const dx = w.x - this.O.x, dy = w.y - this.O.y;
      if (Math.hypot(dx, dy) > 8) tgt = Math.atan2(dy, dx);
    } else if (Math.hypot(this.vx, this.vy) > 25 && Math.hypot(inp.axis.x, inp.axis.y) > 0.1) tgt = Math.atan2(this.vy, this.vx);
    if (tgt !== null) this.aimA += ad(tgt, this.aimA) * (1 - Math.exp(-12 * dt));
    const c = Math.cos(this.aimA);
    if (Math.abs(c) > 0.35) this.side = Math.sign(c);
    this.sideX += (this.side * 34 - this.sideX) * (1 - Math.exp(-9 * dt));
    this.O.x = this.x + this.sideX; this.O.y = this.y - 66 + Math.sin(this.time * 3) * 2;
  }

  _camera(dt) {
    const c = this.camera, k = 1 - Math.exp(-5 * dt), W = this.view.w, H = this.view.h;
    const tx = WW <= W ? WW / 2 : clamp(this.x + this.dir * 60, W / 2, WW - W / 2);
    const ty = clamp(this.y - 20, H / 2, WH - H / 2);
    c.x += (tx - c.x) * k; c.y += (ty - c.y) * k; c.z = 1;
  }

  // ---------------- çizim ----------------
  render(g) {
    const W = this.view.w, H = this.view.h, T = this.time, c = this.camera;
    setBoil(T);
    g.fillStyle = '#0a0710'; g.fillRect(0, 0, W, H);
    g.save(); this.applyCamera(g);
    this._ground(g, W, H, T);
    if (this.tech) this._cone(g, T);
    // y sıralı çizim: Mobu araya girer
    const x0 = c.x - W / 2 - 60, x1 = c.x + W / 2 + 60, y0 = c.y - H / 2 - 40, y1 = c.y + H / 2 + 110;
    let mobuDone = false;
    for (const o of this.objs) {
      if (!mobuDone && o.y > this.y) { this._mobu(g, T); mobuDone = true; }
      if (o.x < x0 || o.x > x1 || o.y < y0 || o.y > y1) continue;
      this._obj(g, o, T);
    }
    if (!mobuDone) this._mobu(g, T);
    this._camIcon(g, T);
    this.parts.draw(g);
    g.restore();
    this._exitArrow(g, W, H, T);
    this._gpu(g, W, H, T);
    this._banner(g, W, H, T);
    const v = g.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, Math.max(W, H) * 0.7);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(60,20,120,.38)'); g.fillStyle = v; g.fillRect(0, 0, W, H);
    if (this.over && !this.reduced) {
      const a = 0.12 + 0.08 * Math.sin(T * 9), r = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, Math.max(W, H) * 0.65);
      r.addColorStop(0, 'rgba(255,74,92,0)'); r.addColorStop(1, `rgba(255,74,92,${a})`); g.fillStyle = r; g.fillRect(0, 0, W, H);
    }
  }

  _ground(g, W, H, T) {
    const gr = g.createLinearGradient(0, 0, 0, WH); gr.addColorStop(0, '#171022'); gr.addColorStop(0.5, '#1c1429'); gr.addColorStop(1, '#130d1d');
    g.fillStyle = gr; g.fillRect(0, 0, WW, WH);
    // yosun lekeleri (düzensiz serpiştirme, sabit)
    g.fillStyle = 'rgba(80,50,130,.10)';
    for (let i = 0; i < 90; i++) { const x = hash01(i * 7 + 1) * WW, y = hash01(i * 13 + 5) * WH; g.beginPath(); g.ellipse(x, y, 14 + hash01(i) * 16, 6 + hash01(i + 3) * 6, 0, 0, 7); g.fill(); }
    g.strokeStyle = 'rgba(139,61,255,.35)'; g.lineWidth = 3; g.strokeRect(0, 0, WW, WH);
    // giriş platformu
    const pa = this.strikes > 0 ? 0.55 + 0.25 * Math.sin(T * 5) : 0.35;
    g.save(); g.strokeStyle = `rgba(182,124,255,${pa})`; g.lineWidth = 2.5; g.setLineDash([8, 6]);
    g.beginPath(); g.ellipse(START.x, START.y, 70, 34, 0, 0, 7); g.stroke(); g.restore();
    g.fillStyle = 'rgba(139,61,255,.10)'; g.beginPath(); g.ellipse(START.x, START.y, 70, 34, 0, 0, 7); g.fill();
    txt(g, 'GİRİŞ', START.x, START.y + 58, 13, 'rgba(233,221,255,.7)', 'center', 800);
    if (this.strikes > 0) txt(g, 'sayaç burada sıfırlanır', START.x, START.y + 75, 12, 'rgba(233,221,255,.6)', 'center', 700);
    // çıkış kapısı: iki sütun + kemer
    const ex = EXIT.x, ey = EXIT.y;
    glowAt(g, ex, ey - 40, 150, '139,61,255', 0.2 + 0.05 * Math.sin(T * 3));
    for (const sx of [-1, 1]) poly(g, [[ex + sx * 58 - 12, ey + 12], [ex + sx * 58 + 12, ey + 12], [ex + sx * 58 + 10, ey - 96], [ex + sx * 58 - 10, ey - 96]], '#3a2f5a', 4100 + (sx > 0 ? 1 : 0), 4);
    poly(g, [[ex - 70, ey - 96], [ex + 70, ey - 96], [ex + 70, ey - 118], [ex - 70, ey - 118]], PURPLE, 4110, 4);
    txt(g, 'ÇIKIŞ', ex, ey - 134, 14, LAV, 'center', 900);
  }

  // ---- ağaç / kaya ----
  _pine(x, y) { return [[[x - 23, y - 10], [x + 23, y - 10], [x, y - 44]], [[x - 17, y - 30], [x + 17, y - 30], [x, y - 64]]]; }
  _rockPts(o) {
    const cx = o.x, cy = o.y - ROCK_R * 0.55, pts = [];
    for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2 + 0.3, r = ROCK_R * (0.82 + 0.22 * hash01(o.seed + i)); pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.85]); }
    return pts;
  }

  _obj(g, o, T) {
    const ghost = this.tech && o.st !== 0;
    if (ghost) { this._ghost(g, o); return; }
    let k = 1;
    if (this.tech && T - o.popT < 0.3) k = lerp(0.72, 1, eBack(clamp((T - o.popT) / 0.3)));
    g.save();
    if (k !== 1) { g.translate(o.x, o.y); g.scale(k, k); g.translate(-o.x, -o.y); }
    if (o.rock) {
      const pts = this._rockPts(o);
      g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(o.x + 4, o.y + 2, ROCK_R * 0.95, 9, 0, 0, 7); g.fill();
      poly(g, pts, '#3b3550', o.seed, 4);
      poly(g, [pts[5], pts[6], pts[7], pts[8], pts[0]].map(p => [p[0], p[1] - 3]), '#524a70', o.seed + 500, 3);
    } else {
      const [t1, t2] = this._pine(o.x, o.y);
      g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(o.x + 3, o.y + 1, 20, 6, 0, 0, 7); g.fill();
      poly(g, [[o.x - 4, o.y], [o.x + 4, o.y], [o.x + 4, o.y - 14], [o.x - 4, o.y - 14]], '#3a2b4f', o.seed, 3);
      poly(g, t1, '#2c1f4a', o.seed + 1, 3.5);
      poly(g, t2, '#38276a', o.seed + 2, 3.5);
    }
    g.restore();
  }

  _ghost(g, o) {
    const col = o.st === 2 ? 'rgba(255,74,92,.8)' : 'rgba(182,124,255,.75)';
    g.save(); g.globalAlpha = 0.6; g.setLineDash([5, 4]); g.lineWidth = 1.6; g.strokeStyle = col; g.lineJoin = 'round';
    const shapes = o.rock ? [this._rockPts(o)] : this._pine(o.x, o.y);
    for (const pts of shapes) { g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); g.stroke(); }
    if (!o.rock) { g.beginPath(); g.rect(o.x - 4, o.y - 14, 8, 14); g.stroke(); }
    g.restore();
  }

  // ---- teknik: görüş konisi ve kaya gölge kamaları ----
  _cone(g, T) {
    const O = this.O, a = this.aimA, half = this.s.fov * Math.PI / 360, far = this.s.far;
    const path = () => { g.beginPath(); g.moveTo(O.x, O.y); g.arc(O.x, O.y, far, a - half, a + half); g.closePath(); };
    g.save();
    path(); const gr = g.createRadialGradient(O.x, O.y, 10, O.x, O.y, far);
    gr.addColorStop(0, 'rgba(139,61,255,.26)'); gr.addColorStop(1, 'rgba(139,61,255,.07)'); g.fillStyle = gr; g.fill();
    // kaya gölgeleri (koniyle kırpılı)
    if (this.s.occl && this.wedges.length) {
      g.save(); path(); g.clip();
      for (const w of this.wedges) {
        const tl = Math.sqrt(w.d * w.d - w.q.r * w.q.r), L = far + 40, a1 = w.a - w.hw, a2 = w.a + w.hw;
        g.beginPath();
        g.moveTo(O.x + Math.cos(a1) * tl, O.y + Math.sin(a1) * tl);
        g.lineTo(O.x + Math.cos(a1) * L, O.y + Math.sin(a1) * L);
        g.lineTo(O.x + Math.cos(a2) * L, O.y + Math.sin(a2) * L);
        g.lineTo(O.x + Math.cos(a2) * tl, O.y + Math.sin(a2) * tl);
        g.closePath(); g.fillStyle = 'rgba(8,0,24,.62)'; g.fill();
        g.setLineDash([6, 5]); g.strokeStyle = 'rgba(255,74,92,.7)'; g.lineWidth = 1.4; g.stroke(); g.setLineDash([]);
      }
      g.restore();
    }
    path(); g.setLineDash(this.s.frustum ? [] : [7, 6]); g.lineWidth = this.s.frustum ? 2.2 : 1.6; g.strokeStyle = 'rgba(182,124,255,.9)'; g.stroke();
    // uzak düzlem yayı daha belirgin
    g.setLineDash([]); g.lineWidth = 3.5; g.strokeStyle = LAV; g.beginPath(); g.arc(O.x, O.y, far, a - half, a + half); g.stroke();
    g.restore();
    const lx = O.x + Math.cos(a) * (far + 18), ly = O.y + Math.sin(a) * (far + 18);
    txt(g, 'UZAK DÜZLEM', lx, ly, 11, LAV, 'center', 800, true);
  }

  _camIcon(g, T) {
    const O = this.O, a = this.aimA;
    g.save(); g.translate(O.x, O.y); g.rotate(a); g.lineJoin = 'round';
    g.fillStyle = '#2B2B2B'; g.strokeStyle = '#E9DDFF'; g.lineWidth = 2;
    g.beginPath(); g.roundRect(-11, -8, 22, 16, 4); g.fill(); g.stroke();
    g.fillStyle = '#E9DDFF'; g.fillRect(-4, -11, 8, 3);
    g.fillStyle = PURPLE; g.beginPath(); g.arc(5, 0, 5, 0, 7); g.fill(); g.strokeStyle = INK; g.lineWidth = 2; g.stroke();
    g.fillStyle = '#E9DDFF'; g.beginPath(); g.arc(6.5, -1.5, 1.5, 0, 7); g.fill();
    g.restore();
  }

  _mobu(g, T) {
    const m = mk(T, this.x, this.y, S), L = this.loadS;
    const moving = Math.hypot(this.vx, this.vy) > 15;
    if (this.st === 'won') { m.face = 'proud'; }
    else {
      if (moving) walk(m, this.phase, this.dir, 1, clamp(Math.hypot(this.vx, this.vy) / SPEED, 0.3, 1.1));
      if (L >= 100 || this.freeze > 0) m.face = 'scared';
      else if (L > 75) m.face = 'O';
      else if (L < 60 && (this.s.frustum || this.s.occl)) m.face = 'happy';
      m.sweat = clamp((L - 55) / 55, 0, 1);
    }
    drawMobu(g, m);
  }

  _exitArrow(g, W, H, T) {
    const sx = EXIT.x - this.camera.x + W / 2, sy = EXIT.y - this.camera.y + H / 2;
    if (sx < W - 24) return;
    const y = clamp(sy, 170, H - 130), b = Math.sin(T * 5) * 3;
    g.save(); g.translate(W - 20 + b, y); g.fillStyle = LAV; g.strokeStyle = INK; g.lineWidth = 3; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(10, 0); g.lineTo(-8, -12); g.lineTo(-8, 12); g.closePath(); g.stroke(); g.fill(); g.restore();
    txt(g, 'ÇIKIŞ', W - 40, y + 26, 12, LAV, 'center', 800);
  }

  // ---- köşedeki ekran kartı: tepside ağaç taşır, yük arttıkça terler ----
  _gpu(g, W, H, T) {
    const L = clamp(this.loadS / 100, 0, 1.6), cx = W - 70, cy = 46;
    const sh = this.over && !this.reduced ? Math.sin(T * 40) * 2 : (L > 0.8 && !this.reduced ? Math.sin(T * 22) * 0.8 : 0);
    g.fillStyle = 'rgba(10,6,20,.62)'; g.beginPath(); g.roundRect(cx - 62, cy - 34, 124, 134, 12); g.fill();
    g.save(); g.translate(cx + sh, cy);
    // kollar + tepsi
    g.strokeStyle = INK; g.lineWidth = 5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-44, 14); g.lineTo(-38, -8); g.moveTo(44, 14); g.lineTo(38, -8); g.stroke();
    g.strokeStyle = '#B67CFF'; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(-44, 14); g.lineTo(-38, -8); g.moveTo(44, 14); g.lineTo(38, -8); g.stroke();
    g.fillStyle = '#2B2B2B'; g.strokeStyle = INK; g.lineWidth = 3;
    g.beginPath(); g.roundRect(-46, -12, 92, 6, 3); g.fill(); g.stroke();
    // tepsideki mini ağaçlar: sayı çizilen yüke bağlı
    const n = Math.min(8, Math.round(clamp(L, 0, 1.4) * 5.5));
    for (let i = 0; i < n; i++) {
      const x = -39 + i * 11.2, w = Math.sin(T * 6 + i) * L * 1.6;
      g.fillStyle = '#4b3480'; g.strokeStyle = INK; g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(x - 5 + w, -12); g.lineTo(x + 5 + w, -12); g.lineTo(x + w * 1.6, -24 - (i % 2) * 2); g.closePath(); g.fill(); g.stroke();
    }
    // gövde
    const hot = clamp((L - 0.5) / 0.6);
    g.fillStyle = '#2B2B2B'; g.strokeStyle = INK; g.lineWidth = 3.5;
    g.beginPath(); g.roundRect(-52, 2, 104, 46, 8); g.fill(); g.stroke();
    g.fillStyle = `rgba(255,74,92,${0.1 + hot * 0.5})`; g.beginPath(); g.roundRect(-52, 2, 104, 46, 8); g.fill();
    g.fillStyle = PURPLE; g.fillRect(-48, 6, 96, 3);
    // fanlar
    for (const fx of [-38, 38]) {
      g.save(); g.translate(fx, 30); g.rotate(T * (2 + L * 14) * (fx < 0 ? 1 : -1));
      g.strokeStyle = '#B67CFF'; g.lineWidth = 1.8; g.beginPath(); g.arc(0, 0, 10, 0, 7); g.stroke();
      for (let i = 0; i < 3; i++) { g.rotate(Math.PI * 2 / 3); g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -9); g.stroke(); }
      g.restore();
    }
    // yüz
    g.fillStyle = '#E9DDFF';
    if (L > 1) {
      g.strokeStyle = '#E9DDFF'; g.lineWidth = 2.2;
      for (const ex of [-13, 13]) { g.beginPath(); g.moveTo(ex - 4, 22); g.lineTo(ex + 4, 28); g.moveTo(ex + 4, 22); g.lineTo(ex - 4, 28); g.stroke(); }
    } else for (const ex of [-13, 13]) { g.beginPath(); g.ellipse(ex, 25, 3.5, L > 0.75 ? 5 : 4, 0, 0, 7); g.fill(); }
    g.strokeStyle = '#E9DDFF'; g.lineWidth = 2.2; g.beginPath();
    if (L < 0.55) g.arc(0, 32, 6, 0.15 * Math.PI, 0.85 * Math.PI);
    else if (L < 0.9) { g.moveTo(-6, 38); g.lineTo(6, 38); }
    else { for (let i = 0; i <= 6; i++) { const x = -8 + i * 16 / 6, y = 39 + (i % 2 ? -2.5 : 2.5); i ? g.lineTo(x, y) : g.moveTo(x, y); } }
    g.stroke();
    // ter damlaları
    if (L > 0.65) for (let i = 0; i < (L > 1 ? 3 : 2); i++) {
      const u = (T * 1.3 + i * 0.37) % 1, x = (i % 2 ? 1 : -1) * (30 + i * 5), y = 6 + u * 34;
      g.fillStyle = `rgba(150,200,255,${0.9 * (1 - u)})`; g.beginPath(); g.ellipse(x, y, 2.4, 3.6, 0, 0, 7); g.fill();
    }
    g.restore();
    // yük çubuğu + sayılar
    const bw = 104, bx = cx - bw / 2, by = cy + 62;
    g.fillStyle = 'rgba(0,0,0,.55)'; g.beginPath(); g.roundRect(bx - 2, by - 2, bw + 4, 12, 6); g.fill();
    g.fillStyle = 'rgba(255,255,255,.14)'; g.beginPath(); g.roundRect(bx, by, bw, 8, 4); g.fill();
    const k = clamp(this.loadS / 100);
    g.fillStyle = this.loadS >= 100 ? RED : (this.loadS > 80 ? '#FF8A5C' : PURPLE); g.beginPath(); g.roundRect(bx, by, Math.max(8, bw * k), 8, 4); g.fill();
    txt(g, `%${Math.round(this.loadS)}  ·  ${this.fps} fps`, cx, by + 24, 13, this.loadS >= 100 ? RED : LAV, 'center', 800, true);
    // aşım sayacı
    txt(g, `Aşım: ${this.strikes}`, cx - 68, cy + 30, 13, this.strikes > 0 ? RED : 'rgba(233,221,255,.55)', 'right', 800);
  }

  _banner(g, W, H, T) {
    if (this.st === 'won') return;
    if (this.over || this.freeze > 0) {
      const a = 0.7 + 0.3 * Math.sin(T * 12);
      g.save(); g.globalAlpha = a; pill(g, 'EKRAN KARTI BOĞULUYOR', W / 2, H - 176, RED, 14); g.restore();
    }
  }
}
