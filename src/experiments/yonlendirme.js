// yonlendirme.js — #04 "Oyunlar seni fark ettirmeden nasıl yönlendiriyor?"
// Dört koridor geometrik olarak birebir aynı; fark yalnızca ipuçlarından (ışık, renk, çevre düzeni, hareket) gelir.
import { Experiment } from '../core/experiment.js';
import { clamp, lin, lerp, eOut, eBack, moveToward, rng } from '../core/math.js';
import { INK, PURPLE, GLOW, LAV, FONT, MONO, setBoil, poly } from '../core/ink.js';
import { mk, walk, landSq, drawMobu, ARM_HIP } from '../core/mobu.js';
import { Particles, glowAt } from '../core/fx.js';
import { txt } from '../core/ui.js';

const S = 0.28, SPEED = 190, ACC = 1700;
const RC = 70;                 // merkez oda yarı genişliği
const CW = 45;                 // koridor yarı genişliği
const CL = 260;                // koridor sonu (kapı çizgisi)
const DOOR_T = 240;            // kapıya temas eşiği (merkez eksende)
const BOX = 16;                // Mobu çarpışma yarı kutusu
const ROUNDS = 3;
const DIRS = [
  { n: 'K', x: 0, y: -1, a: -Math.PI / 2 },
  { n: 'D', x: 1, y: 0, a: 0 },
  { n: 'G', x: 0, y: 1, a: Math.PI / 2 },
  { n: 'B', x: -1, y: 0, a: Math.PI },
];
const CUES = ['light', 'color', 'composition', 'motion'];
const CUE_TAG = { light: 'IŞIK', color: 'RENK', composition: 'YAPI', motion: 'HAREKET' };
const GRAYC = '#6b6478';

const walkable = (x, y) =>
  (Math.abs(x) <= RC && Math.abs(y) <= RC) ||
  (Math.abs(x) <= CW && Math.abs(y) <= CL) ||
  (Math.abs(y) <= CW && Math.abs(x) <= CL);
const boxFree = (x, y) => walkable(x - BOX, y - BOX) && walkable(x + BOX, y - BOX) && walkable(x - BOX, y + BOX) && walkable(x + BOX, y + BOX);

export default class Yonlendirme extends Experiment {
  static id = 'yonlendirme';
  static kind = '2d';
  static controls = {
    joystick: true, buttons: [], pointer: null,
    hint: '← ↑ ↓ → ya da WASD: yürü',
    hintTouch: 'Joystick: yürü',
  };
  static settings = [
    { key: 'light', label: 'Işık', type: 'toggle', value: true, group: 'İpuçları' },
    { key: 'color', label: 'Renk', type: 'toggle', value: true, group: 'İpuçları' },
    { key: 'composition', label: 'Çevre düzeni', type: 'toggle', value: true, group: 'İpuçları' },
    { key: 'motion', label: 'Hareket', type: 'toggle', value: true, group: 'İpuçları' },
    { key: 'tryOff', label: 'İpuçsuz dene', type: 'button', group: 'Karşılaştır' },
    { key: 'tryOn', label: 'İpuçlu dene', type: 'button', group: 'Karşılaştır' },
  ];

  init() {
    // kapı sırası: tohumlu karıştırma, her denemede aynı (adil karşılaştırma)
    const r = rng(11), o = [0, 1, 2, 3];
    for (let i = 3; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; }
    this.order = o.slice(0, ROUNDS);
    this.res = { on: [], off: [] };      // oturum boyunca gerçek tur süreleri (Tekrar'da korunur)
    this.parts = new Particles(80);
    this.reset();
  }

  reset() {
    this.parts.clear();
    this.round = 0; this.exit = this.order[0];
    this.x = 0; this.y = 0; this.vx = 0; this.vy = 0; this.dirX = 1; this.phase = 0;
    this.startT = null; this.roundT = 0; this.wrong = 0; this.wrongRound = 0;
    this.st = 'play'; this.stT = -9; this.bumpLock = false; this.bumpT = -9; this.bumpD = null; this.landT = -9; this.spawnT = -9;
    this.openT = -9; this.mode = 'on'; this.fadeA = 0;
    this._seedDust(rng(5));
    this.camera.x = 0; this.camera.y = 0; this.camera.z = 1;
    this.hud(null);
  }

  _seedDust(r) {
    this.dust = [];
    for (let i = 0; i < 16; i++) this.dust.push({ u: 80 + r() * 170, v: (r() - 0.5) * 60, sp: 24 + r() * 34, ph: r() * 6.28, sz: 1.3 + r() * 1.4 });
    this._r = r;
  }

  get anyCue() { return CUES.some(k => this.s[k]); }

  onSetting(key) {
    if (key === 'tryOff') { for (const k of CUES) this.setSetting(k, false); this.reset(); this.toast('İpuçsuz: aynı kapı sırası, 3 tur'); }
    else if (key === 'tryOn') { for (const k of CUES) this.setSetting(k, true); this.reset(); this.toast('İpuçlu: aynı kapı sırası, 3 tur'); }
  }

  avg(a) { return a.length ? (a.reduce((p, c) => p + c, 0) / a.length).toFixed(1) : null; }

  // ---------------- güncelleme ----------------
  update(dt) {
    const T = this.time, W = this.view.w, H = this.view.h;
    this.camera.x = 0; this.camera.y = -20; this.camera.z = Math.min(W, H) / 600 * 0.9;
    this.parts.update(dt);
    // hareket ipucu parçacıkları (doğru koridora doğru süzülür)
    for (const d of this.dust) {
      d.u += d.sp * dt;
      if (d.u > CL - 12) { d.u = 74; d.v = (this._r() - 0.5) * 60; d.sp = 24 + this._r() * 34; }
    }
    if (this.st === 'play') this._play(dt, T);
    else if (this.st === 'open') this._open(dt, T);
    else this._fade(dt, T);
    this._hud(T);
  }

  _move(dt, tx, ty) {
    this.vx = moveToward(this.vx, tx, ACC * dt); this.vy = moveToward(this.vy, ty, ACC * dt);
    const nx = this.x + this.vx * dt; if (boxFree(nx, this.y)) this.x = nx; else this.vx = 0;
    const ny = this.y + this.vy * dt; if (boxFree(this.x, ny)) this.y = ny; else this.vy = 0;
    if (Math.abs(this.vx) > 8) this.dirX = Math.sign(this.vx);
    const sp = Math.hypot(this.vx, this.vy);
    if (sp > 15) this.phase += sp * dt * 0.05;
  }

  _play(dt, T) {
    const ax = this.input.axis.x, ay = this.input.axis.y;
    const stunned = T - this.bumpT < 0.35;
    const mag = Math.hypot(ax, ay);
    if (this.startT === null && mag > 0.15) { this.startT = T; this.mode = this.anyCue ? 'on' : 'off'; }
    this._move(dt, stunned ? 0 : ax * SPEED, stunned ? 0 : ay * SPEED);
    if (this.startT !== null) this.roundT = T - this.startT;
    // kapıya temas
    let hit = -1;
    for (let i = 0; i < 4; i++) { const d = DIRS[i]; if (this.x * d.x + this.y * d.y >= DOOR_T) hit = i; }
    if (hit < 0) {
      for (let i = 0; i < 4; i++) { const d = DIRS[i]; if (this.x * d.x + this.y * d.y < DOOR_T - 28) this.bumpLock = false; }
      return;
    }
    if (hit === this.exit) {
      if (this.startT === null) { this.startT = T; this.mode = this.anyCue ? 'on' : 'off'; }
      this.roundT = T - this.startT;
      this.st = 'open'; this.openT = T; this.vx = this.vy = 0;
      (this.mode === 'on' ? this.res.on : this.res.off).push(this.roundT);
      this.audio.play('pop');
      const d = DIRS[hit]; this.parts.sparks(d.x * (CL + 8), d.y * (CL + 8), this.reduced ? 4 : 12, GLOW);
      this.toast(`Tur ${this.round + 1}: ${this.roundT.toFixed(1)} s`, 1400);
    } else if (!this.bumpLock) {
      this.bumpLock = true; this.bumpT = T; this.wrong++; this.wrongRound++;
      const d = DIRS[hit]; this.bumpD = d;
      this.vx = -d.x * 150; this.vy = -d.y * 150;
      this.audio.play('hit'); this.shake(4);
    }
  }

  _open(dt, T) {
    this.vx = moveToward(this.vx, 0, ACC * dt); this.vy = moveToward(this.vy, 0, ACC * dt);
    if (T - this.openT < 0.6) return;
    if (this.round + 1 >= ROUNDS) {
      if (!this.completed && T - this.openT > 0.9) {
        this.audio.play('success');
        this.complete({ text: this.cfg.lesson });
      }
      return;
    }
    this.st = 'out'; this.stT = T;
  }

  _fade(dt, T) {
    const u = T - this.stT;
    if (this.st === 'out') {
      this.fadeA = clamp(u / 0.15);
      if (u >= 0.15) {                       // oda karanlıkken: yeni tur, Mobu merkezde belirir (kesme)
        this.round++; this.exit = this.order[this.round];
        this.x = 0; this.y = 0; this.vx = this.vy = 0; this.startT = null; this.roundT = 0; this.wrongRound = 0;
        this.bumpLock = false; this.bumpT = -9; this.spawnT = T; this.openT = -9;
        this.st = 'in'; this.stT = T; this.parts.clear();
      }
    } else {
      this.fadeA = 1 - clamp(u / 0.15);
      if (u >= 0.15) { this.fadeA = 0; this.st = 'play'; }
    }
  }

  _hud(T) {
    const t = (this.startT === null ? 0 : this.roundT).toFixed(1);
    const right = [];
    const a1 = this.avg(this.res.on), a0 = this.avg(this.res.off);
    if (this.tech) right.push(`Yanlış kapı: ${this.wrong}`);
    if (a1) right.push(`İpuçlu ortalama: ${a1} s`);
    if (a0) right.push(`İpuçsuz ortalama: ${a0} s`);
    this.hud({ left: [this.tech ? `Tur ${this.round + 1}/${ROUNDS} · ${t} s` : `${t} s`], right });
  }

  // ---------------- çizim ----------------
  render(g) {
    const W = this.view.w, H = this.view.h, T = this.time;
    setBoil(T);
    g.fillStyle = '#09070e'; g.fillRect(0, 0, W, H);
    g.save(); this.applyCamera(g);
    this._room(g, T);
    for (let i = 0; i < 4; i++) this._corridor(g, i, T);
    for (let i = 0; i < 4; i++) this._door(g, i, T);
    this._mobu(g, T);
    this.parts.draw(g);
    if (this.tech) this._techWorld(g, T);
    g.restore();
    const v = g.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, Math.max(W, H) * 0.7);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(60,20,120,.38)'); g.fillStyle = v; g.fillRect(0, 0, W, H);
    if (this.fadeA > 0) { g.fillStyle = `rgba(4,2,8,${this.fadeA})`; g.fillRect(0, 0, W, H); }
  }

  _room(g, T) {
    g.fillStyle = '#1b1428'; g.fillRect(-RC, -RC, RC * 2, RC * 2);
    g.strokeStyle = 'rgba(182,124,255,.22)'; g.lineWidth = 2; g.strokeRect(-RC, -RC, RC * 2, RC * 2);
  }

  // koridoru kendi yerel çerçevesinde çiz (u: boyuna, v: enine) → dört koridor aynı kodla, birebir aynı
  _corridor(g, i, T) {
    const d = DIRS[i], good = i === this.exit, s = this.s;
    g.save(); g.rotate(d.a);
    g.fillStyle = '#1b1428'; g.fillRect(RC - 2, -CW, CL - RC + 4, CW * 2);
    // yan duvar çizgileri
    g.strokeStyle = 'rgba(182,124,255,.22)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(RC, -CW); g.lineTo(CL, -CW); g.moveTo(RC, CW); g.lineTo(CL, CW); g.stroke();
    // ışık: doğru koridor biraz aydınlık, diğerleri karanlık
    if (s.light) {
      if (good) {
        const gr = g.createLinearGradient(RC, 0, CL, 0); gr.addColorStop(0, 'rgba(139,61,255,0)'); gr.addColorStop(1, 'rgba(139,61,255,.26)');
        g.fillStyle = gr; g.fillRect(RC, -CW, CL - RC, CW * 2);
      } else { g.fillStyle = 'rgba(4,2,8,.5)'; g.fillRect(RC, -CW, CL - RC, CW * 2); }
    }
    // çevre düzeni: kapıya doğru sıklaşan simetrik sütun çiftleri + açık zemin şeridi
    if (s.composition && good) {
      g.fillStyle = 'rgba(214,196,255,.11)'; g.fillRect(RC, -13, CL - RC, 26);
      let u = RC + 14, gap = 34;
      while (u < CL - 8) {
        g.fillStyle = 'rgba(200,170,255,.5)';
        g.fillRect(u - 3, -CW + 4, 6, 8); g.fillRect(u - 3, CW - 12, 6, 8);
        u += gap; gap = Math.max(11, gap - 3.6);
      }
    }
    // hareket: doğru koridora doğru süzülen toz/kıvılcım
    if (s.motion && good) {
      for (const p of this.dust) {
        const a = Math.sin(clamp((p.u - 70) / (CL - 80)) * Math.PI) * 0.8;
        const v = p.v + Math.sin(T * 1.6 + p.ph) * 5;
        g.fillStyle = `rgba(226,208,255,${a})`; g.fillRect(p.u - p.sz / 2, v - p.sz / 2, p.sz, p.sz);
      }
    }
    g.restore();
    if (s.light && good) glowAt(g, d.x * (CL - 6), d.y * (CL - 6), 120, '182,124,255', 0.55);
  }

  _door(g, i, T) {
    const d = DIRS[i], good = i === this.exit, s = this.s;
    g.save(); g.rotate(d.a);
    const open = good ? eOut(lin(T - this.openT, 0, 0.5)) : 0;
    const col = s.color && good ? PURPLE : GRAYC;
    if (open > 0) {                                  // açılan kapının ardı: ışık
      g.fillStyle = '#d9c6ff'; g.globalAlpha = 0.85; g.fillRect(CL, -CW + 4, 20, CW * 2 - 8); g.globalAlpha = 1;
    }
    const half = (CW - 4) * (1 - open);              // iki kanat kenarlara kayarak açılır
    if (half > 0.5) {
      g.fillStyle = '#2a2238';
      g.fillRect(CL, -CW + 4, 20, half); g.fillRect(CL, CW - 4 - half, 20, half);
    }
    poly(g, [[CL, -CW], [CL + 22, -CW], [CL + 22, CW], [CL, CW]], null, 9100 + i * 7, 3);
    g.strokeStyle = col; g.lineWidth = 5; g.lineJoin = 'round'; g.strokeRect(CL - 2, -CW - 2, 26, CW * 2 + 4);
    g.strokeStyle = INK; g.lineWidth = 1.5; g.strokeRect(CL - 5, -CW - 5, 32, CW * 2 + 10);
    // kapı üstünde hafif sallanan fener (hareket ipucu)
    if (s.motion && good) {
      const sw = Math.sin(T * 2.2) * 6;
      g.strokeStyle = 'rgba(200,170,255,.6)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(CL + 11, -CW - 16); g.lineTo(CL + 11, -CW - 6 + sw * 0.15); g.stroke();
      g.fillStyle = LAV; g.beginPath(); g.arc(CL + 11, -CW - 4 + sw * 0.15, 4, 0, 7); g.fill();
      glowAt(g, CL + 11, -CW - 4, 22, '182,124,255', 0.3);
    }
    g.restore();
  }

  _mobu(g, T) {
    const m = mk(T, this.x, this.y, S);
    m.look = clamp(this.vx / SPEED) * 0.9; m.lookY = clamp(this.vy / SPEED);
    const sp = Math.hypot(this.vx, this.vy);
    const bump = T - this.bumpT;
    if (this.st === 'open' || (this.st === 'out')) {
      m.face = 'proud'; m.armL = ARM_HIP; m.armR = ARM_HIP; landSq(m, T, this.openT, 0.6, 0.3);
    } else if (bump < 0.7 && this.bumpD) {
      const k = Math.exp(-bump * 5), d = this.bumpD;
      m.face = 'flat'; const hor = Math.abs(d.x) > 0;
      if (hor) { m.sx *= 1 - 0.28 * k; m.sy *= 1 + 0.08 * k; } else { m.sy *= 1 - 0.22 * k; m.sx *= 1 + 0.12 * k; }
      m.rot = -d.x * 0.1 * k;
    } else if (sp > 15) {
      walk(m, this.phase, this.dirX, 1, clamp(sp / SPEED, 0.3, 1.1));
    }
    const u = T - this.spawnT;
    if (u < 0.3) { const k = eBack(clamp(u / 0.3)); m.sx *= lerp(0.5, 1, k); m.sy *= lerp(0.5, 1, k); }
    drawMobu(g, m);
  }

  // ---- teknik görünüm: doğru kapıda mor çerçeve + etkin ipucu çipleri ----
  _techWorld(g, T) {
    const d = DIRS[this.exit], px = d.x * (CL + 11), py = d.y * (CL + 11);
    g.save(); g.rotate(d.a);
    g.strokeStyle = 'rgba(182,124,255,.95)'; g.lineWidth = 1.5; g.strokeRect(CL - 8, -CW - 8, 38, CW * 2 + 16);
    g.restore();
    const act = CUES.filter(k => this.s[k]);
    const horiz = d.x !== 0, bw = 64, bh = 17;
    act.forEach((k, i) => {
      let cx, cy;
      if (horiz) { cx = d.x * 246; cy = -CW - 20 - i * (bh + 3) + (d.x > 0 ? 0 : 0); if (d.x < 0) cy = -CW - 20 - i * (bh + 3); }
      else { cx = CW + 12 + bw / 2; cy = d.y * (CL - 6) + (i - (act.length - 1) / 2) * (bh + 3); }
      g.fillStyle = 'rgba(20,10,40,.9)'; g.beginPath(); g.roundRect(cx - bw / 2, cy - bh / 2, bw, bh, 8); g.fill();
      g.strokeStyle = PURPLE; g.lineWidth = 1.2; g.stroke();
      txt(g, CUE_TAG[k], cx, cy + 0.5, 12, LAV, 'center', 800, true);
    });
  }
}
