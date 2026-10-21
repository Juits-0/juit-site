// duvar.js — #13 "Oyunlarda görünmez duvarlar neden var?"
// Kuşbakışı gece çayırı: dört kenarın görünmez sınırını keşfet. Beton duvar manzarayı kapatır.
import { Experiment } from '../core/experiment.js';
import { clamp, lin, lerp, eOut, eBack, eIn, moveToward, hash01 } from '../core/math.js';
import { INK, PURPLE, LAV, FONT, setBoil } from '../core/ink.js';
import { mk, walk, landSq, drawMobu, ARM_UPS, ARM_HIP, ARM_SCARED } from '../core/mobu.js';
import { Particles } from '../core/fx.js';
import { txt, pill } from '../core/ui.js';

// ---- ölçüler (dünya px) ----
const S = 0.3;                                  // Mobu ölçeği (~140 px)
const HX = 26, HY = 8, BH = 120;                // ayak izi yarı genişlik/derinlik, çarpışma kutusu boyu
const RUN = 230, ACC = 1700, DEC = 2400;
const PX0 = -420, PX1 = 420, PY0 = -230, PY1 = 230;   // oynanabilir alan (sınır)
const GX = 760, GY = 550;                       // dünyanın zemin kenarı (ötesi boşluk)
const WALL_H = 340, PANEL_H = 96;
const EDGE = ['Kuzey', 'Güney', 'Doğu', 'Batı'];
const PIP = ['K', 'G', 'D', 'B'];

export default class Duvar extends Experiment {
  static id = 'duvar';
  static kind = '2d';
  static controls = {
    joystick: true, buttons: [], pointer: null,
    hint: 'WASD ya da oklar: yürü · R: yeniden başlat',
    hintTouch: 'Joystick: yürü',
  };
  static settings = [
    { key: 'mode', label: 'Sınır türü', type: 'select', value: 'invisible', group: 'Sınır',
      options: [{ value: 'invisible', label: 'Görünmez duvar' }, { value: 'concrete', label: 'Beton duvar' }, { value: 'none', label: 'Sınır yok' }] },
    { key: 'back', label: 'Dekorun arkasını göster', type: 'toggle', value: false, group: 'Sınır' },
  ];

  init() {
    // dekor: hepsi düzenli, simetrik dizilmiş ayakta duran karton parçalar
    this.deco = [];
    [150, 210, 170, 260, 170, 210, 150].forEach((h, i) => this.deco.push({ k: 'm', x: (i - 3) * 200, y: PY0 - 190, h, hw: h * 0.42 }));
    for (let i = -6; i <= 6; i++) this.deco.push({ k: 't', x: i * 100, y: PY1 + 190, s: 1.1, h: 92, hw: 28 });
    [70, 92, 76, 96, 76, 92, 70].forEach((h, i) => this.deco.push({ k: 'b', x: PX1 + 190, y: (i - 3) * 100, w: 64, h, hw: 32, idx: i }));
    for (let j = -4; j <= 4; j++) this.deco.push({ k: 't', x: PX0 - 190, y: j * 75, s: 1.1, h: 92, hw: 28 });
    this.deco.forEach((d, i) => { d.id = i; d.back = 0; d.al = 1; });
    this.parts = new Particles(200);
    this.reset();
  }

  reset() {
    this.parts.clear();
    this.x = 0; this.y = 60; this.vx = 0; this.vy = 0; this.dir = 1; this.phase = 0;
    this.st = 'play'; this.stT = 0; this.stunT = 0; this.landT = -9; this.dropOff = 0;
    this.found = [false, false, false, false]; this.nFound = 0;
    this.glow = [null, null, null, null]; this.bump = null; this.bumps = 0; this.falls = 0;
    this.won = false; this.wonT = 0; this.hinted = false; this.fallEdge = 0;
    this.grayK = this.s.mode === 'concrete' ? 1 : 0; this.wallK = this.s.mode === 'concrete' ? 1 : 0;
    this.camera.x = this.x; this.camera.y = this.y - 50; this.camera.z = this.view.w < 600 ? 0.6 : 0.7;
    this.hud(null);
  }

  resize() { this.camera.z = this.view.w < 600 ? 0.6 : 0.7; }

  onSetting(key, v) {
    if (key === 'mode') {
      this.toast(v === 'invisible' ? 'Görünmez duvar: manzara korunuyor' : v === 'concrete' ? 'Beton duvar: sınır tamam, manzara gitti' : 'Sınır yok: dünyanın kenarına dikkat', 1800);
    }
  }

  // ---------------- güncelleme ----------------
  update(dt) {
    const T = this.time, mode = this.s.mode;
    this.parts.update(dt);
    // beton duvar ve gri dünya geçişleri
    this.wallK = moveToward(this.wallK, mode === 'concrete' ? 1 : 0, dt * (mode === 'concrete' ? 2.6 : 3));
    this.grayK = moveToward(this.grayK, mode === 'concrete' ? 1 : 0, dt * 1.6);
    if (this.st === 'play') this._play(dt, T, mode);
    else if (this.st === 'fall') this._fall(T);
    else this._drop(T);
    if (this.won && !this.completed && T - this.wonT > 1.1) this.complete({ text: this.cfg.lesson });
    if (!this.hinted && this.bumps === 0 && this.st === 'play' && T > 7) { this.hinted = true; this.toast('Manzaraya doğru yürümeyi dene', 2200); }
    // kamera
    const c = this.camera, k = 1 - Math.exp(-6 * dt);
    let tx = this.x, ty = this.y - 50;
    if (this.st === 'fall' && T - this.stT > 0.35) { tx = 0; ty = 10; }
    if (this.st === 'drop') { tx = 0; ty = 10; }
    c.x += (tx - c.x) * (this.st === 'play' ? k : 1 - Math.exp(-3.2 * dt)); c.y += (ty - c.y) * (this.st === 'play' ? k : 1 - Math.exp(-3.2 * dt));
    c.z = this.view.w < 600 ? 0.6 : 0.7;
    this._hud();
  }

  _dists() {   // dört kenara ayak izinden mesafe (K, G, D, B)
    return [(this.y - HY) - PY0, PY1 - (this.y + HY), PX1 - (this.x + HX), (this.x - HX) - PX0];
  }

  _hud() {
    if (!this.tech) { this.hud(null); return; }
    const d = this._dists();
    let mi = 0; for (let i = 1; i < 4; i++) if (d[i] < d[mi]) mi = i;
    const v = Math.round(d[mi]);
    const dtxt = v >= 0 ? `Sınıra mesafe: ${v} px (${EDGE[mi]})` : `Sınırın dışında: ${-v} px (${EDGE[mi]})`;
    const right = [`Keşfedilen kenar: ${this.nFound}/4`];
    right.push(this.s.mode === 'none' ? `Düşme: ${this.falls}` : `Çarpma: ${this.bumps}`);
    this.hud({ left: [dtxt, `Sınır: ${this.s.mode === 'invisible' ? 'görünmez' : this.s.mode === 'concrete' ? 'beton' : 'yok'}`], right });
  }

  _play(dt, T, mode) {
    const inp = this.input, locked = this.completed;
    if (this.stunT > 0) {
      this.stunT -= dt;
      this.vx = moveToward(this.vx, 0, 650 * dt); this.vy = moveToward(this.vy, 0, 650 * dt);
    } else {
      const ax = locked ? 0 : inp.axis.x, ay = locked ? 0 : inp.axis.y;
      this.vx = moveToward(this.vx, ax * RUN, (ax ? ACC : DEC) * dt);
      this.vy = moveToward(this.vy, ay * RUN * 0.9, (ay ? ACC : DEC) * dt);
    }
    if (Math.abs(this.vx) > 12) this.dir = Math.sign(this.vx);
    let nx = this.x + this.vx * dt, ny = this.y + this.vy * dt;
    if (mode !== 'none') {
      const lx = PX0 + HX, hx = PX1 - HX, ly = PY0 + HY, hy = PY1 - HY;
      const inside = this.x >= lx - 1 && this.x <= hx + 1 && this.y >= ly - 1 && this.y <= hy + 1;
      if (!inside) {      // sınırın dışındaysa (mod değişti) ışınlama yok: yavaşça içeri yürütülür
        nx = moveToward(this.x, clamp(this.x, lx, hx), 300 * dt); ny = moveToward(this.y, clamp(this.y, ly, hy), 300 * dt);
      } else {
        let edge = -1;
        if (ny < ly) { ny = ly; if (this.vy < -40) edge = 0; this.vy = Math.max(this.vy, 0); }
        else if (ny > hy) { ny = hy; if (this.vy > 40) edge = 1; this.vy = Math.min(this.vy, 0); }
        if (nx > hx) { nx = hx; if (this.vx > 40) edge = 2; this.vx = Math.min(this.vx, 0); }
        else if (nx < lx) { nx = lx; if (this.vx < -40) edge = 3; this.vx = Math.max(this.vx, 0); }
        if (edge >= 0 && this.stunT <= 0 && !locked) this._hit(edge, nx, ny, T);
      }
    }
    this.x = nx; this.y = ny;
    if (Math.hypot(this.vx, this.vy) > 20) this.phase += Math.hypot(this.vx, this.vy) * dt * 0.05;
    if (Math.hypot(this.vx, this.vy) > 120 && this.stunT <= 0 && this.frame % 14 === 0) this.parts.dust(this.x - this.dir * 12, this.y, 1, -this.dir);
    // dünyanın kenarından düşme (sınır yokken)
    if (mode === 'none' && !locked) {
      let e = -1;
      if (this.y < -GY) e = 0; else if (this.y > GY) e = 1; else if (this.x > GX) e = 2; else if (this.x < -GX) e = 3;
      if (e >= 0) this._startFall(e, T);
    }
  }

  _discover(edge, T) {
    if (this.found[edge]) return;
    this.found[edge] = true; this.nFound++;
    this.audio.play('pop');
    this.toast(`${EDGE[edge]} sınır keşfedildi (${this.nFound}/4)`, 1500);
    if (this.nFound >= 4 && !this.won) {
      this.won = true; this.wonT = T; this.audio.play('success');
      this.parts.confetti(this.x, this.y - 120, 50);
    }
  }

  _hit(edge, x, y, T) {
    this.stunT = 0.42; this.bumps++;
    const v = 260;
    if (edge === 0) this.vy = v; else if (edge === 1) this.vy = -v; else if (edge === 2) this.vx = -v; else this.vx = v;
    this.bump = { t0: T, edge, x, y };
    this.glow[edge] = { t0: T, pos: edge < 2 ? x : y };
    this.audio.play('hit'); this.shake(3);
    this.parts.stars(x, y - 120, 4); this.parts.dust(x, y, 5);
    this._discover(edge, T);
  }

  _startFall(edge, T) {
    this.st = 'fall'; this.stT = T; this.fallEdge = edge; this.falls++; this.vx = 0; this.vy = 0;
    this.audio.play('whoosh'); this.toast(`Dünyanın ${EDGE[edge].toLowerCase()} kenarından düştün`, 1800);
    this._discover(edge, T);
  }
  _fall(T) {
    if (T - this.stT > 0.9) {       // yeniden iniş: gökyüzünden düşerek geri gelir
      this.st = 'drop'; this.stT = T; this.x = 0; this.y = 60; this.vx = 0; this.vy = 0;
    }
  }
  _drop(T) {
    const a = T - this.stT;
    this.dropOff = a < 0.5 ? -230 * (1 - (a / 0.5) * (a / 0.5)) : 0;
    if (a >= 0.5) {
      this.st = 'play'; this.landT = T; this.dropOff = 0; this.audio.play('land'); this.parts.dust(this.x, this.y, 8);
    }
  }

  // ---------------- renk yardımcısı (beton modunda dünya griye döner) ----------------
  _c(r, g, b, a) {
    const k = this.grayK, l = r * 0.3 + g * 0.59 + b * 0.11, f = 1 - 0.28 * k;
    const R = Math.round((r + (l * 0.9 - r) * k) * f), G = Math.round((g + (l * 0.9 - g) * k) * f), B = Math.round((b + (l * 0.92 - b) * k) * f);
    return a == null ? `rgb(${R},${G},${B})` : `rgba(${R},${G},${B},${a})`;
  }

  // ---------------- çizim ----------------
  render(g) {
    const W = this.view.w, H = this.view.h, T = this.time, c = this.camera;
    setBoil(T);
    g.fillStyle = this._c(8, 6, 14); g.fillRect(0, 0, W, H);
    g.save(); this.applyCamera(g);
    const hx = (W / 2) / c.z + 80, hy = (H / 2) / c.z + 80;
    const vx0 = c.x - hx, vx1 = c.x + hx, vy0 = c.y - hy, vy1 = c.y + hy;
    this._void(g, vx0, vx1, vy0, vy1, T);
    this._ground(g, vx0, vx1, vy0, vy1);
    if (this.tech) this._techGround(g);
    // derinlik sıralı çizim
    const my = this.y, items = [];
    for (const d of this.deco) {
      if (d.x < vx0 - 200 || d.x > vx1 + 200 || d.y < vy0 - 150 || d.y > vy1 + 350) continue;
      const dist = Math.hypot(this.x - d.x, (this.y - d.y) * 1.2);
      const tgt = this.s.back ? 1 : this.s.mode === 'none' ? clamp(1 - (dist - 90) / 110) : 0;
      d.back = moveToward(d.back, tgt, 0.06 + 0.0);
      const dx = Math.abs(this.x - d.x), dy = d.y - my;
      const f = clamp((d.hw + 10 - dx) / 30) * clamp(dy / 20) * clamp((d.h - dy) / 30);
      d.al = 1 - 0.7 * f;
      items.push({ key: d.y, x: d.x, f: () => this._deco(g, d, T) });
    }
    items.push({ key: my, x: this.x, f: () => this._mobu(g, T) });
    const mode = this.s.mode, wk = this.wallK;
    if (wk > 0.01) {
      items.push({ key: -5000, x: 0, f: () => this._wallSide(g, 3) }, { key: -4999, x: 1, f: () => this._wallSide(g, 2) });
      items.push({ key: PY0 - 6, x: 0, f: () => this._wallNS(g, 0) }, { key: PY1 + 6, x: 0, f: () => this._wallNS(g, 1) });
    }
    if (mode === 'invisible' || mode === 'none') {
      items.push({ key: -4998, x: 2, f: () => this._panels(g, 2, T) }, { key: -4997, x: 3, f: () => this._panels(g, 3, T) });
      items.push({ key: PY0 - 4, x: 1, f: () => this._panels(g, 0, T) }, { key: PY1 + 4, x: 1, f: () => this._panels(g, 1, T) });
    }
    items.sort((a, b) => a.key - b.key || a.x - b.x);
    for (const it of items) it.f();
    if (this.tech) this._techMobu(g);
    this.parts.draw(g);
    this._bumpText(g, T);
    g.restore();
    // ekran uzayı: mor kenar vinyeti ve küçük göstergeler
    const v = g.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, Math.max(W, H) * 0.7);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, `rgba(${Math.round(60 - 30 * this.grayK)},${Math.round(20 + 10 * this.grayK)},${Math.round(120 - 60 * this.grayK)},.38)`);
    g.fillStyle = v; g.fillRect(0, 0, W, H);
    this._pips(g, W);
  }

  _pips(g, W) {
    for (let i = 0; i < 4; i++) {
      const x = W / 2 + (i - 1.5) * 30, y = 22;
      g.beginPath(); g.arc(x, y, 11, 0, 7);
      g.fillStyle = this.found[i] ? PURPLE : 'rgba(255,255,255,.1)'; g.fill();
      g.strokeStyle = this.found[i] ? LAV : 'rgba(255,255,255,.25)'; g.lineWidth = 1.6; g.stroke();
      txt(g, PIP[i], x, y + 0.5, 12, this.found[i] ? '#fff' : 'rgba(255,255,255,.5)', 'center', 800);
    }
    if (this.s.mode !== 'none') {
      if (this.s.mode === 'concrete') pill(g, 'ATMOSFER ✗', W / 2, 54, '#5b5868', 13, '#ece8f5');
      else pill(g, 'ATMOSFER ✓', W / 2, 54, PURPLE, 13);
    }
  }

  _void(g, x0, x1, y0, y1, T) {
    const st = 90;
    for (let cx = Math.floor(x0 / st); cx <= Math.ceil(x1 / st); cx++) for (let cy = Math.floor(y0 / st); cy <= Math.ceil(y1 / st); cy++) {
      const h = hash01(cx * 31 + cy * 17 + 3);
      if (h < 0.55) continue;
      g.fillStyle = this._c(182, 124, 255, 0.08 + 0.1 * Math.abs(Math.sin(T * 0.8 + h * 20)));
      g.fillRect(cx * st + h * 60, cy * st + hash01(cx * 7 + cy * 13) * 60, 3, 3);
    }
  }

  _ground(g, x0, x1, y0, y1) {
    g.fillStyle = this._c(22, 16, 34); g.fillRect(-GX, GY, GX * 2, 46);          // toprak dudağı
    g.strokeStyle = INK; g.lineWidth = 4; g.strokeRect(-GX, -GY, GX * 2, GY * 2 + 46);
    g.fillStyle = this._c(32, 24, 50); g.fillRect(-GX, -GY, GX * 2, GY * 2);
    g.fillStyle = this._c(54, 41, 84); g.fillRect(PX0, PY0, PX1 - PX0, PY1 - PY0);
    // düzenli çim öbekleri
    const st = 80;
    g.lineWidth = 2; g.lineCap = 'round';
    for (let gx = Math.max(-GX + 40, Math.floor(x0 / st) * st); gx <= Math.min(GX - 40, x1); gx += st) {
      for (let gy = Math.max(-GY + 40, Math.floor(y0 / st) * st); gy <= Math.min(GY - 40, y1); gy += st) {
        const inPlay = gx > PX0 && gx < PX1 && gy > PY0 && gy < PY1;
        g.strokeStyle = this._c(inPlay ? 92 : 70, inPlay ? 76 : 58, inPlay ? 140 : 108, 0.7);
        g.beginPath(); g.moveTo(gx - 6, gy); g.lineTo(gx - 8, gy - 9); g.moveTo(gx, gy); g.lineTo(gx, gy - 12); g.moveTo(gx + 6, gy); g.lineTo(gx + 8, gy - 9); g.stroke();
      }
    }
  }

  // dekor parçası: ön yüz + (yaklaşınca / ayardan) karton arka yüz
  _shape(d) {
    if (d.k === 'm') { const h = d.h, w = h * 1.5; return [[-w / 2, 0], [-w * 0.12, -h * 0.75], [0, -h], [w * 0.14, -h * 0.7], [w / 2, 0]]; }
    if (d.k === 'b') return [[-d.w / 2, 0], [d.w / 2, 0], [d.w / 2, -d.h], [-d.w / 2, -d.h]];
    const s = d.s; return [[-8, 0], [-8, -16], [-30, -16], [-14, -44], [-24, -44], [0, -84], [24, -44], [14, -44], [30, -16], [8, -16], [8, 0]].map(p => [p[0] * s, p[1] * s]);
  }
  _path(g, pts) { g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); }

  _deco(g, d, T) {
    const pts = this._shape(d), bk = d.back;
    g.save(); g.translate(d.x, d.y); g.lineJoin = 'round';
    const bw = d.k === 'm' ? d.h * 1.5 : d.k === 'b' ? d.w : 60 * d.s, bh = d.k === 't' ? 84 * d.s : d.h;
    g.globalAlpha = d.al;
    if (bk < 0.98) {
      g.globalAlpha = d.al * (1 - bk);
      this._path(g, pts);
      if (d.k === 'm') {
        const h = d.h, w = h * 1.5;
        g.fillStyle = this._c(66, 48, 108); g.fill();
        g.fillStyle = this._c(48, 35, 84); this._path(g, [[0, -h], [w * 0.14, -h * 0.7], [w / 2, 0], [0, 0]]); g.fill();
        g.fillStyle = this._c(208, 198, 238); this._path(g, [[0, -h], [-w * 0.12, -h * 0.75], [-w * 0.05, -h * 0.68], [0, -h * 0.75], [w * 0.06, -h * 0.67], [w * 0.14, -h * 0.7]]); g.fill();
      } else if (d.k === 'b') {
        g.fillStyle = this._c(50, 42, 88); g.fill();
        const rows = Math.floor((d.h - 14) / 22);
        for (let r = 0; r < rows; r++) for (let q = 0; q < 3; q++) {
          g.fillStyle = (r * 3 + q + d.idx) % 3 === 0 ? this._c(214, 190, 255) : this._c(62, 50, 100);
          g.fillRect(-24 + q * 18, -d.h + 10 + r * 22, 12, 13);
        }
        g.strokeStyle = this._c(120, 100, 170); g.lineWidth = 2; g.beginPath(); g.moveTo(0, -d.h); g.lineTo(0, -d.h - 16); g.stroke();
      } else {
        g.fillStyle = this._c(56, 52, 116); g.fill();
        g.fillStyle = this._c(70, 48, 58); g.fillRect(-8 * d.s, -16 * d.s, 16 * d.s, 16 * d.s);
        g.fillStyle = this._c(44, 40, 94);
        g.save(); this._path(g, pts); g.clip(); g.fillRect(0, -90 * d.s, 40 * d.s, 90 * d.s); g.restore();
      }
      g.strokeStyle = INK; g.lineWidth = 3; this._path(g, pts); g.stroke();
    }
    if (bk > 0.02) {   // arkası: karton + tahta iskele
      g.globalAlpha = d.al * bk;
      this._path(g, pts); g.fillStyle = this._c(122, 98, 72); g.fill();
      g.save(); this._path(g, pts); g.clip();
      g.strokeStyle = this._c(90, 70, 50, 0.5); g.lineWidth = 2;
      for (let q = -bw; q < bw; q += 14) { g.beginPath(); g.moveTo(q, 0); g.lineTo(q + bh * 0.5, -bh); g.stroke(); }
      g.restore();
      g.lineCap = 'round'; g.strokeStyle = this._c(168, 126, 80); g.lineWidth = 7;
      g.beginPath();
      g.moveTo(-bw * 0.26, 0); g.lineTo(-bw * 0.08, -bh * 0.6); g.moveTo(bw * 0.26, 0); g.lineTo(bw * 0.08, -bh * 0.6);
      g.moveTo(-bw * 0.2, -bh * 0.3); g.lineTo(bw * 0.2, -bh * 0.3);
      g.stroke();
      g.lineWidth = 7; g.beginPath(); g.moveTo(0, -bh * 0.6); g.lineTo(bw * 0.2, 34); g.stroke();   // arkadaki destek payandası
      g.strokeStyle = INK; g.lineWidth = 3; this._path(g, pts); g.stroke();
      if (bk > 0.6) txt(g, 'karton', 0, -bh * 0.12, 11, this._c(240, 224, 200), 'center', 700, true);
    }
    g.restore();
  }

  // ---- görünmez sınır panelleri ----
  _panels(g, edge, T) {
    if (this.s.mode === 'concrete') return;
    const horiz = edge < 2, a0 = horiz ? PX0 : PY0, a1 = horiz ? PX1 : PY1;
    const f = edge === 0 ? PY0 : edge === 1 ? PY1 : edge === 2 ? PX1 : PX0;
    const info = this.glow[edge];
    let gA = 0;
    if (info) { const a = T - info.t0; gA = eOut(lin(a, 0, 0.12)) * (1 - lin(a, 0.7, 1.9)); }
    const full = this.tech && this.s.mode === 'invisible';
    if (!full && gA <= 0.01) return;
    const n = Math.round((a1 - a0) / 60), step = (a1 - a0) / n;
    const wt = p => full ? 1 : info ? clamp(1 - Math.abs(p - info.pos) / 230) * gA : 0;
    const P = p => horiz ? [p, f] : [f, p];
    g.save(); g.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const p0 = a0 + i * step, p1 = p0 + step, w = (wt(p0) + wt(p1)) / 2;
      if (w < 0.03) continue;
      const A = P(p0), B = P(p1);
      g.fillStyle = `rgba(150,80,255,${(0.3 * w).toFixed(3)})`;
      g.beginPath(); g.moveTo(A[0], A[1]); g.lineTo(B[0], B[1]); g.lineTo(B[0], B[1] - PANEL_H); g.lineTo(A[0], A[1] - PANEL_H); g.closePath(); g.fill();
      g.strokeStyle = `rgba(225,200,255,${(0.75 * w).toFixed(3)})`; g.lineWidth = 2;
      g.beginPath(); g.moveTo(A[0], A[1] - PANEL_H); g.lineTo(B[0], B[1] - PANEL_H); g.stroke();
      const sy = ((T * 0.8 + i * 0.13) % 1) * PANEL_H;       // yukarı akan ince ışık çizgisi
      g.strokeStyle = `rgba(255,255,255,${(0.35 * w).toFixed(3)})`; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(A[0], A[1] - sy); g.lineTo(B[0], B[1] - sy); g.stroke();
    }
    for (let i = 0; i <= n; i++) {
      const p = a0 + i * step, w = wt(p); if (w < 0.03) continue;
      const A = P(p);
      g.strokeStyle = `rgba(200,160,255,${(0.95 * w).toFixed(3)})`; g.lineWidth = 5;
      g.beginPath(); g.moveTo(A[0], A[1]); g.lineTo(A[0], A[1] - PANEL_H - 6); g.stroke();
      g.fillStyle = `rgba(240,225,255,${w.toFixed(3)})`; g.beginPath(); g.arc(A[0], A[1] - PANEL_H - 6, 4, 0, 7); g.fill();
    }
    g.restore();
  }

  // ---- beton duvar ----
  _concrete(g, x, y, w, h) {
    g.fillStyle = '#6f6c7a'; g.fillRect(x, y, w, h);
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
    g.strokeStyle = 'rgba(30,28,40,.55)'; g.lineWidth = 2;
    for (let q = y + 60; q < y + h; q += 60) { g.beginPath(); g.moveTo(x, q); g.lineTo(x + w, q); g.stroke(); }
    if (w > h) for (let q = x + 70; q < x + w; q += 140) for (let r = 0; r < h; r += 120) { g.beginPath(); g.moveTo(q + (r / 120 % 2) * 70, y + r); g.lineTo(q + (r / 120 % 2) * 70, y + Math.min(r + 60, h)); g.stroke(); }
    g.restore();
    g.strokeStyle = INK; g.lineWidth = 4; g.strokeRect(x, y, w, h);
  }
  _wallNS(g, edge) {
    const k = eOut(this.wallK), off = (1 - k) * -260;
    g.save(); g.globalAlpha = clamp(this.wallK * 2);
    if (edge === 0) {
      this._concrete(g, PX0 - 26, PY0 - WALL_H + off, PX1 - PX0 + 52, WALL_H);
    } else {
      this._concrete(g, PX0 - 26, PY1 + 10 + off, PX1 - PX0 + 52, 40);
      g.fillStyle = '#8a8796'; g.fillRect(PX0 - 24, PY1 + off, PX1 - PX0 + 48, 10); g.strokeStyle = INK; g.lineWidth = 3; g.strokeRect(PX0 - 24, PY1 + off, PX1 - PX0 + 48, 10);
    }
    g.restore();
  }
  _wallSide(g, edge) {
    const k = eOut(this.wallK), off = (1 - k) * -260;
    g.save(); g.globalAlpha = clamp(this.wallK * 2);
    this._concrete(g, edge === 2 ? PX1 : PX0 - 26, PY0 - WALL_H + off, 26, PY1 - PY0 + WALL_H);
    g.restore();
  }

  // ---- Mobu ----
  _mobu(g, T) {
    const st = this.st;
    const yOff = st === 'drop' ? this.dropOff : 0;
    let m;
    if (st === 'fall') {
      const a = clamp((T - this.stT) / 0.9), e = eIn(a);
      const dirv = this.fallEdge === 0 ? 1 : this.fallEdge === 1 ? 1 : 1;
      m = mk(T, this.x, this.y + 200 * e * dirv, S);
      m.nosh = true; m.face = 'scared'; m.armL = m.armR = ARM_SCARED;
      const sc = 1 - 0.45 * e; m.sx *= sc; m.sy *= sc; m.rot = Math.sin(a * 14) * 0.28;
      g.save(); g.globalAlpha = 1 - 0.75 * lin(a, 0.3, 1);
      drawMobu(g, m); g.restore(); return;
    }
    m = mk(T, this.x, this.y + yOff, S);
    m.gy = this.y;
    const sp = Math.hypot(this.vx, this.vy);
    if (st === 'drop') {
      m.face = 'O'; m.armL = m.armR = ARM_UPS; m.legL = [-8, -24]; m.legR = [8, -28];
    } else if (this.won) {
      m.face = 'proud'; m.armL = m.armR = ARM_HIP; landSq(m, T, this.wonT, 0.6, 0.3);
    } else {
      const b = this.bump, a = b ? T - b.t0 : 9;
      if (a < 1.2) {
        m.face = a < 0.22 ? 'O' : (this.s.mode === 'concrete' ? 'sad' : 'sus');
        const sq = Math.sin(clamp(a / 0.3) * Math.PI);
        if (b.edge < 2) { m.sy *= 1 - 0.26 * sq; m.sx *= 1 + 0.18 * sq; }
        else { m.sx *= 1 - 0.22 * sq; m.sy *= 1 + 0.1 * sq; m.rot = (b.edge === 2 ? -1 : 1) * 0.14 * sq; }
        if (a < 0.45) m.armL = m.armR = ARM_SCARED;
      } else if (this.s.mode === 'concrete' && this.wallK > 0.6) m.face = 'sad';
      if (sp > 25 && this.stunT <= 0) walk(m, this.phase, this.dir, 1, clamp(sp / RUN, 0.3, 1.1));
      if (this.s.mode === 'concrete' && this.wallK > 0.6 && a >= 1.2) m.face = 'sad';
    }
    landSq(m, T, this.landT, 1, 0.22);
    drawMobu(g, m);
  }

  _bumpText(g, T) {
    const b = this.bump; if (!b) return;
    const a = T - b.t0;
    const big = (s, x, y, size, col, rot) => {
      g.save(); g.translate(x, y); g.rotate(rot); g.font = `900 ${size}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineJoin = 'round'; g.strokeStyle = INK; g.lineWidth = size * 0.24; g.strokeText(s, 0, 0); g.fillStyle = col; g.fillText(s, 0, 0); g.restore();
    };
    if (a < 0.95) {
      const k = eBack(clamp(a / 0.16)) * (1 - lin(a, 0.62, 0.95));
      if (k > 0.02) { g.save(); g.translate(b.x, b.y - 188); g.scale(k, k); big('TONK!', 0, 0, 42, '#fff', -0.1); g.restore(); }
    }
    if (a > 0.2 && a < 1.5) {
      const k = eBack(clamp((a - 0.2) / 0.22)) * (1 - lin(a, 1.15, 1.5));
      if (k > 0.02) { g.save(); g.translate(this.x + 34, this.y - 168 - 6 * Math.sin(a * 6)); g.scale(k, k); big('?', 0, 0, 36, LAV, 0.12); g.restore(); }
    }
  }

  // ---------------- teknik görünüm ----------------
  _techGround(g) {
    g.save();
    g.fillStyle = 'rgba(139,61,255,.14)'; g.beginPath(); g.rect(-GX, -GY, GX * 2, GY * 2); g.rect(PX0, PY0, PX1 - PX0, PY1 - PY0); g.fill('evenodd');
    g.setLineDash([10, 7]); g.lineWidth = 2; g.strokeStyle = 'rgba(233,221,255,.85)'; g.strokeRect(PX0, PY0, PX1 - PX0, PY1 - PY0); g.setLineDash([]);
    txt(g, 'OYNANABİLİR ALAN', 0, 165, 14, 'rgba(233,221,255,.9)', 'center', 800, true);
    const lab = 'rgba(190,160,255,.9)';
    txt(g, 'SADECE MANZARA', 0, PY0 - 60, 13, lab, 'center', 800, true);
    txt(g, 'SADECE MANZARA', 0, PY1 + 62, 13, lab, 'center', 800, true);
    txt(g, 'SADECE MANZARA', PX1 + 78, 0, 12, lab, 'center', 800, true);
    txt(g, 'SADECE MANZARA', PX0 - 78, 0, 12, lab, 'center', 800, true);
    g.restore();
  }
  _techMobu(g) {
    g.save();
    g.fillStyle = 'rgba(182,124,255,.35)'; g.fillRect(this.x - HX, this.y - HY, HX * 2, HY * 2);
    g.lineWidth = 1.6; g.strokeStyle = 'rgba(182,124,255,.95)'; g.strokeRect(this.x - HX, this.y - HY, HX * 2, HY * 2);
    g.strokeRect(this.x - HX, this.y - BH, HX * 2, BH);
    const d = this._dists();
    let mi = 0; for (let i = 1; i < 4; i++) if (d[i] < d[mi]) mi = i;
    const tx = mi === 2 ? PX1 : mi === 3 ? PX0 : this.x, ty = mi === 0 ? PY0 : mi === 1 ? PY1 : this.y;
    g.setLineDash([4, 4]); g.strokeStyle = 'rgba(233,221,255,.8)'; g.beginPath(); g.moveTo(this.x, this.y); g.lineTo(tx, ty); g.stroke(); g.setLineDash([]);
    const v = Math.round(d[mi]);
    txt(g, `${v} px`, (this.x + tx) / 2, (this.y + ty) / 2 + (mi < 2 ? 0 : 14), 11, v >= 0 ? LAV : '#ff8aa0', 'center', 700, true);
    g.restore();
  }
}
